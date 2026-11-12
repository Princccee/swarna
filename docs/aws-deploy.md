# Svarna on AWS: setup and CI/CD

One EC2 server in Mumbai runs the same Docker Compose stack as local. GitHub Actions builds the
images, pushes them to ECR and deploys on every push to `main`. Cost is about **$20/month**.
GitHub Actions is free because the repo is public.

```
GitHub (push to main) ──► Actions: CI → build images → ECR → SSM "deploy.sh" on EC2 → health check
                                                                     │
EC2 t3.small ─ caddy (HTTPS) ─► web (nginx) ─► api ─► postgres / redis / rustfs
   │ nightly + pre-deploy pg_dump ──► S3 (svarna-ops-<account>/backups, 30 days)
   └ daily EBS snapshot (7 kept)
```

| Path | Purpose |
|---|---|
| `infra/terraform/` | All AWS resources (EC2, Elastic IP, security group, ECR, S3, IAM, SSM params, snapshots) |
| `docker-compose.aws.yml` | Makes the server run ECR images instead of building |
| `deploy/deploy.sh` | Runs on the server: writes `.env` from SSM, backs up, pulls, restarts, health check, rollback |
| `deploy/backup.sh` | `pg_dump` → S3 (nightly timer + before each deploy) |
| `.github/workflows/ci.yml` | Build + tests on every PR |
| `.github/workflows/deploy.yml` | CI → build → deploy on push to `main`; manual rollback |

---

## One-time setup

### 1. AWS account
1. Create an AWS account and **turn on MFA for the root user**. After that, don't use root.
2. IAM → create a user (e.g. `admin`) with `AdministratorAccess` plus an access key, used **only by
   Terraform on your laptop**.
3. Billing → Budgets → create a monthly budget alert, e.g. $30.

### 2. Tools on your laptop
- AWS CLI v2, then `aws configure` (region `ap-south-1`, the access key from step 1.2)
- Terraform ≥ 1.6
- (optional) Session Manager plugin for the AWS CLI, to open a shell on the server

### 3. Create the infrastructure
```bash
cd infra/terraform
terraform init
terraform apply          # review the plan, type "yes"  (~3 min)
terraform output
```
`terraform.tfstate` stays on your laptop (git-ignored). **Keep a private backup of it**, because it
holds the generated secrets.

### 4. Owner login for the fresh database
Production starts empty. Tell the API who the first owner is, using a password of at least 12 characters:
```bash
aws ssm put-parameter --name /svarna/prod/BOOTSTRAP_OWNER_EMAIL    --type String       --value "you@example.com"
aws ssm put-parameter --name /svarna/prod/BOOTSTRAP_OWNER_NAME     --type String       --value "Your Name"
aws ssm put-parameter --name /svarna/prod/BOOTSTRAP_OWNER_PASSWORD --type SecureString --value "<strong password>"
```
After your first successful login, delete the password parameter:
`aws ssm delete-parameter --name /svarna/prod/BOOTSTRAP_OWNER_PASSWORD`
It is only used when the database has no users, but there's no reason to keep it.

### 5. Connect GitHub
Copy the values from `terraform output github_variables` into repository variables (these are not secrets):
```bash
gh variable set AWS_REGION       --body "ap-south-1"
gh variable set AWS_DEPLOY_ROLE  --body "arn:aws:iam::<acct>:role/svarna-github-deploy"
gh variable set ECR_REGISTRY     --body "<acct>.dkr.ecr.ap-south-1.amazonaws.com"
gh variable set OPS_BUCKET       --body "svarna-ops-<acct>"
gh variable set APP_INSTANCE_TAG --body "svarna-app"
gh variable set SITE_URL         --body "https://<ip-with-dashes>.sslip.io"
```
No AWS keys go into GitHub. Each run gets short-lived credentials through OIDC, and the IAM role
only trusts `main` / the `production` environment of `Princccee/swarna`.

### 6. First deploy
Push or merge to `main`, or go to Actions → **Deploy** → *Run workflow*. The first run takes about 10 minutes.
Then open `SITE_URL` and log in with the owner from step 4.

---

## Branch workflow

```
feature/xyz ──merge──► dev ──(CI: build + tests)──► merge dev into main ──► Deploy (release)
```
1. Start every change from `dev`: `git checkout dev && git pull && git checkout -b feature/xyz`
2. Work and commit, then merge back: `git checkout dev && git merge --no-ff feature/xyz && git push`
3. Every push to `dev` runs **CI** (build + tests). Nothing is deployed.
4. When `dev` is green and tested, release it: `git checkout main && git pull && git merge --no-ff dev && git push`.
   That push to `main` is what deploys to AWS.

Never commit directly to `main`.

## What happens on every push / merge to `main`
1. **CI**: `npm ci`, build shared types, Prisma generate, build API, run the API tests, build the web app.
   If anything fails, the run stops and **nothing is deployed**.
2. **Build**: the `api` and `web` images are built in parallel (layer-cached) and pushed to ECR as `:<commit-sha>` and `:latest`.
3. **Deploy** through SSM Run Command (no SSH port open):
   - the compose files + `deploy/` scripts are uploaded to S3, and the server downloads them
   - `.env` is rebuilt from SSM Parameter Store `/svarna/prod/*`
   - `pg_dump` → `s3://…/backups/pre-deploy/<sha>/…`
   - `docker compose pull api web` → `up -d`. The API runs `prisma migrate deploy` on start.
   - it waits up to 3 minutes for `GET /api/v1/health`. **If that fails, it restarts the previous images** and the run fails.
4. **Public check**: `SITE_URL/api/v1/health` must answer.

Pull requests only run CI. Two quick pushes queue up; a running deploy is never cancelled halfway.
Downtime per deploy is about 5–15 seconds while the API restarts.

## Everyday operations
| Task | How |
|---|---|
| **Roll back** | Actions → Deploy → Run workflow → `image_tag` = an older full commit SHA |
| **Change a setting / add WhatsApp keys / GSTIN / shop name** | `aws ssm put-parameter --name /svarna/prod/<ENV_NAME> --type SecureString --value … --overwrite`, then re-run the Deploy workflow |
| **Shell on the server** | `terraform output connect_shell` |
| **Logs** | on the server: `cd /opt/svarna/app && docker compose -p svarna logs -f api` |
| **Manual backup** | on the server: `cd /opt/svarna/app && set -a && . ./deploy.env && deploy/backup.sh manual` |
| **Restore a backup** | see the header of `deploy/backup.sh` (`pg_restore --clean`) |

Settings the compose file passes to the API are listed under `api.environment` in
`docker-compose.yml`. A new setting has to be added there too, or the API won't see it.

## Moving to a real domain later
1. Buy the domain and add an **A record** → the Elastic IP (`terraform output public_ip`).
2. `terraform apply -var site_address=svarna.yourshop.in` (updates `SITE_ADDRESS`, `FRONTEND_URL`, `S3_PUBLIC_ENDPOINT`).
3. `gh variable set SITE_URL --body https://svarna.yourshop.in` and re-run Deploy. Caddy gets the new certificate on its own.
4. Item images uploaded earlier store full URLs with the old hostname, so they need a one-off SQL update.

## Known limits
- **Single server:** if the instance dies, restore from the EBS snapshot or the S3 dump. Expect some downtime, not data loss beyond the last backup.
- **Rollback after a migration:** the old code runs against the new schema. That's fine for additive
  migrations (new tables/columns). For destructive ones, restore the pre-deploy backup instead.
- Item images live in RustFS on the server's disk, covered by the EBS snapshots. Moving them to real S3 is a later improvement.
