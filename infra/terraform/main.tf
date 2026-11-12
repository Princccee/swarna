data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  # 13.233.10.20 -> 13-233-10-20.sslip.io (free DNS name that resolves to the IP; Caddy gets a real cert)
  site_address = var.site_address != "" ? var.site_address : "${replace(aws_eip.app.public_ip, ".", "-")}.sslip.io"
  ssm_prefix   = "/${var.name}/prod"
}

# ─── Network: default VPC, only HTTP/HTTPS open (no SSH — admin access is via SSM) ─────────────

data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "app" {
  name        = "${var.name}-app"
  description = "Svarna web server: HTTP/HTTPS in, everything out"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP (Caddy redirects to HTTPS, and ACME challenges)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ─── EC2 instance ─────────────────────────────────────────────────────────────────────────────

data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023_ami.value
  instance_type          = var.instance_type
  iam_instance_profile   = aws_iam_instance_profile.app.name
  vpc_security_group_ids = [aws_security_group.app.id]
  user_data              = file("${path.module}/user_data.sh")

  metadata_options {
    http_tokens                 = "required" # IMDSv2 only
    http_put_response_hop_limit = 2          # lets containers reach instance metadata if ever needed
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_gb
    encrypted   = true
    tags        = { Name = "${var.name}-root", Snapshot = "${var.name}-daily" }
  }

  tags = {
    Name = "${var.name}-app"
    Role = "${var.name}-app" # GitHub Actions targets the deploy command at this tag
  }

  lifecycle {
    # A newer AMI or edited bootstrap script must never replace the server (it holds the database)
    ignore_changes = [ami, user_data]
  }
}

resource "aws_eip" "app" {
  domain = "vpc"
  tags   = { Name = "${var.name}-app" }
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}

# ─── ECR: one repository per image ────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "app" {
  for_each             = toset(["api", "web"])
  name                 = "${var.name}-${each.key}"
  image_tag_mutability = "MUTABLE" # "latest" is re-pointed every deploy; SHA tags are never reused

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 30 most recent images (enough to roll back)"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

# ─── S3: deploy bundles + database backups (private) ──────────────────────────────────────────

resource "aws_s3_bucket" "ops" {
  bucket = "${var.name}-ops-${local.account_id}"
}

resource "aws_s3_bucket_public_access_block" "ops" {
  bucket                  = aws_s3_bucket.ops.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ops" {
  bucket = aws_s3_bucket.ops.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "ops" {
  bucket = aws_s3_bucket.ops.id

  rule {
    id     = "expire-backups"
    status = "Enabled"
    filter {
      prefix = "backups/"
    }
    expiration {
      days = var.backup_retention_days
    }
  }

  rule {
    id     = "expire-releases"
    status = "Enabled"
    filter {
      prefix = "releases/"
    }
    expiration {
      days = 30
    }
  }
}

# ─── Daily EBS snapshots of the server disk (second safety net besides pg_dump) ───────────────

resource "aws_iam_role" "dlm" {
  name = "${var.name}-dlm"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "dlm.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "dlm" {
  role       = aws_iam_role.dlm.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_dlm_lifecycle_policy" "daily" {
  description        = "${var.name} daily disk snapshots"
  execution_role_arn = aws_iam_role.dlm.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]
    target_tags    = { Snapshot = "${var.name}-daily" }

    schedule {
      name = "daily-7-days"
      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["21:30"] # UTC = 03:00 IST, shop closed
      }
      retain_rule {
        count = 7
      }
      copy_tags = true
    }
  }
}
