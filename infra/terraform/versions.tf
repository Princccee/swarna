terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State is kept locally (infra/terraform/terraform.tfstate, git-ignored).
  # It contains the generated secrets, so keep a private backup of it.
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "svarna"
      ManagedBy = "terraform"
    }
  }
}
