# Production configuration lives in SSM Parameter Store under /svarna/prod/<ENV_VAR_NAME>.
# On every deploy the server turns all of them into its .env file, so to add or change a
# setting (WhatsApp token, GSTIN, shop name …) put a parameter there and re-run the deploy.
#
# Terraform generates the secrets below once; it never overwrites a value you edited later.

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "jwt_access" {
  length  = 64
  special = false
}

resource "random_password" "jwt_refresh" {
  length  = 64
  special = false
}

resource "random_password" "rustfs_secret" {
  length  = 40
  special = false
}

resource "random_password" "whatsapp_verify" {
  length  = 24
  special = false
}

resource "random_id" "pii_key" {
  byte_length = 32 # 64 hex chars
}

locals {
  generated_secrets = {
    POSTGRES_PASSWORD             = random_password.postgres.result
    JWT_ACCESS_SECRET             = random_password.jwt_access.result
    JWT_REFRESH_SECRET            = random_password.jwt_refresh.result
    S3_ACCESS_KEY                 = "svarna-rustfs"
    S3_SECRET_KEY                 = random_password.rustfs_secret.result
    PII_ENCRYPTION_KEY            = random_id.pii_key.hex
    WHATSAPP_WEBHOOK_VERIFY_TOKEN = random_password.whatsapp_verify.result
  }

  plain_settings = {
    SITE_ADDRESS       = local.site_address
    FRONTEND_URL       = "https://${local.site_address}"
    S3_PUBLIC_ENDPOINT = "https://${local.site_address}/s3"
    ALLOW_DEMO_RATES   = "false"
  }
}

resource "aws_ssm_parameter" "secret" {
  for_each = local.generated_secrets
  name     = "${local.ssm_prefix}/${each.key}"
  type     = "SecureString"
  value    = each.value

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "setting" {
  for_each = local.plain_settings
  name     = "${local.ssm_prefix}/${each.key}"
  type     = "String"
  value    = each.value
}
