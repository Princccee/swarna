variable "region" {
  description = "AWS region (Mumbai)"
  type        = string
  default     = "ap-south-1"
}

variable "name" {
  description = "Prefix for resource names"
  type        = string
  default     = "svarna"
}

variable "instance_type" {
  description = "EC2 size. t3.small = 2 vCPU / 2 GB, enough for the whole compose stack."
  type        = string
  default     = "t3.small"
}

variable "root_volume_gb" {
  description = "Root EBS size; holds Docker images, Postgres, Redis and RustFS data"
  type        = number
  default     = 30
}

variable "github_repo" {
  description = "owner/repo allowed to deploy through GitHub Actions OIDC"
  type        = string
  default     = "Princccee/swarna"
}

variable "github_repo_with_ids" {
  description = "The same repo in GitHub's immutable-ID form (owner@ownerId/repo@repoId), which newer OIDC tokens use in the sub claim"
  type        = string
  default     = "Princccee@119061630/swarna@1356215399"
}

variable "create_github_oidc_provider" {
  description = "Set false if this AWS account already has the token.actions.githubusercontent.com OIDC provider"
  type        = bool
  default     = true
}

variable "site_address" {
  description = "Public hostname. Leave empty to use <elastic-ip>.sslip.io until you buy a domain."
  type        = string
  default     = ""
}

variable "backup_retention_days" {
  description = "Days to keep database dumps in S3"
  type        = number
  default     = 30
}
