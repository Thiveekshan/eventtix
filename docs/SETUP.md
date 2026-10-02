# Setting up the pipeline from scratch

This takes about 45 minutes the first time, most of it waiting for downloads. All commands are for Windows Command Prompt, and every secret stays on your computer (never in Git).

**You need:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running), [Git](https://git-scm.com/), [Node.js 22](https://nodejs.org/) (only to generate random secrets), and a GitHub account.

## 1. Get the code

```
git clone https://github.com/Thiveekshan/eventtix.git
cd eventtix
```

## 2. Start Jenkins, SonarQube and the image registry

```
cd jenkins
docker compose up -d --build
cd ..
```

The first build takes several minutes. Then check:

| Check | Expected |
| ----- | -------- |
| `docker compose -f jenkins/docker-compose.yml ps` | `jenkins`, `sonarqube`, `sonar-db`, `registry` all running |
| http://localhost:5000/v2/ | `{}` |
| http://localhost:9000 | SonarQube login (takes 1 to 2 minutes to start) |

## 3. Set up Jenkins

1. Get the unlock password: `docker compose -f jenkins/docker-compose.yml exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword`
2. Open http://localhost:8083, paste it, choose **Install suggested plugins**, create your admin user.

## 4. Create the credentials

Jenkins stores every secret in **Manage Jenkins, Credentials, System, Global credentials, Add Credentials**. The pipeline expects exactly these five IDs:

| ID | Kind | What to put in it |
| -- | ---- | ----------------- |
| `github-credentials` | Username with password | Your GitHub username, and a **fine-grained token** for this repository with *Contents: Read and write* (Jenkins reads the code and pushes release tags) |
| `sonar-token` | Secret text | A SonarQube user token (see 4a) |
| `eventtix-staging-secrets` | Secret file | Staging passwords (see 4b) |
| `eventtix-production-secrets` | Secret file | Production passwords, **different from staging** (see 4b) |
| `eventtix-monitoring-secrets` | Secret file | Grafana password and optional Discord webhook (see 4c) |

**4a. SonarQube token.** Open http://localhost:9000, log in as `admin` / `admin`, set a new password, then click your avatar, **My Account, Security**, generate a **User Token**, and copy it.

**4b. Staging and production secret files.** Generate a long random value for each file's `JWT_SECRET`:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
copy deploy\secrets.example staging-secrets.txt
notepad staging-secrets.txt
```

Fill in `POSTGRES_PASSWORD` (letters and numbers only), `JWT_SECRET`, and `ADMIN_PASSWORD`. Upload the file as a *Secret file* credential, then **delete the local copy**. Repeat for `production-secrets.txt` with different values.

**4c. Monitoring secret file.** `copy monitoring\secrets.example monitoring-secrets.txt`, set `GRAFANA_ADMIN_PASSWORD`, and optionally `DISCORD_WEBHOOK_URL` (Discord: channel settings, Integrations, Webhooks, New Webhook, Copy Webhook URL). Upload it, and delete the local copy.

Files ending in `-secrets.txt` are ignored by Git, so they cannot be committed by accident.

## 5. Create the pipeline job

1. **New Item**, name it `eventtix-pipeline`, choose **Pipeline**.
2. Under **Pipeline**, set **Definition** to *Pipeline script from SCM*, **SCM** to *Git*, **Repository URL** to your repository, **Credentials** to `github-credentials`, **Branch** to `*/main`, **Script Path** to `Jenkinsfile`.
3. **Save**, then **Build Now**.

The `Jenkinsfile` makes Jenkins check GitHub every 2 minutes, so later pushes start builds by themselves.

## 6. Watch it run

Open the build, then **Console Output**. The first run takes 10 to 15 minutes (it downloads images). When all seven stages are green, use the address table in the [README](../README.md#environments).

## Troubleshooting

| Symptom | Likely cause and fix |
| ------- | -------------------- |
| Code Quality: "SonarQube is not ready" | SonarQube is still starting. Wait 2 minutes and rebuild |
| Security stage fails | Read the **BLOCKING** list in the log. Fix the finding, or accept it in `security/accepted-risks.json` with a reason and expiry date |
| Deploy: a secret is "missing" or "CHANGE-ME" | Fix the secret file and upload it to Jenkins again (delete the old credential first) |
| Release: registry not reachable | `docker compose -f jenkins/docker-compose.yml up -d` |
| Monitoring: production network does not exist | Production was never deployed. Run the pipeline through the Release stage first |
| Docker commands fail inside Jenkins | Docker Desktop is not running |

Never run `docker compose down -v` in the `jenkins` folder: `-v` deletes your SonarQube history and Jenkins settings.
