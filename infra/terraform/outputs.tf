output "site_url" {
  description = "Open this on your phone / laptop"
  value       = "https://${local.site_address}"
}

output "public_ip" {
  value = aws_eip.app.public_ip
}

output "instance_id" {
  value = aws_instance.app.id
}

output "github_variables" {
  description = "Set these as GitHub repository variables (Settings → Secrets and variables → Actions → Variables)"
  value = {
    AWS_REGION       = var.region
    AWS_DEPLOY_ROLE  = aws_iam_role.github_deploy.arn
    ECR_REGISTRY     = "${local.account_id}.dkr.ecr.${var.region}.amazonaws.com"
    OPS_BUCKET       = aws_s3_bucket.ops.bucket
    APP_INSTANCE_TAG = "${var.name}-app"
    SITE_URL         = "https://${local.site_address}"
  }
}

output "connect_shell" {
  description = "Open a shell on the server without SSH (needs the AWS CLI + Session Manager plugin)"
  value       = "aws ssm start-session --region ${var.region} --target ${aws_instance.app.id}"
}
