# Demonstration guide

How to *show* that the pipeline does what it claims. Use this for the demo video and for report screenshots.

## A. Show a successful run

Open the job in Jenkins and show the **Stage View** with all seven stages green. Then open the live results: production at http://localhost:8082, the Grafana dashboard at http://localhost:3030, and the release at `https://github.com/Thiveekshan/eventtix/releases`.

## B. Show an automatic rollback (real, on the running system)

A bad release must never reach production. This demonstrates it with one click.

1. First make sure the latest build is green, so staging has a healthy version to fall back to.
2. In Jenkins, click **Build with Parameters**, tick **SIMULATE_BAD_RELEASE**, and click **Build**.
3. Watch the build. It passes Build, Test, Code Quality and Security, then in **Deploy**:
   - the log says `SIMULATION: the new version will start with its JWT secret missing`
   - the new backend cannot boot, so the containers never become healthy
   - after about 75 seconds: `DEPLOYMENT FAILED`, then `ROLLING BACK to version ...`, then `ROLLED BACK: staging is running version ... again and is healthy`
4. **Release and Monitoring are skipped**, so production and the GitHub release are untouched.
5. Prove it: open http://localhost:3001/version. It still reports the *previous* build number, and http://localhost:8081 still works.

The checkbox only ever affects staging. Asked to simulate a bad release in production, the script refuses.

Then run **Build Now** again (checkbox off) to return to a normal green build.

## C. Show incident alerts (production)

Put the Grafana dashboard, http://localhost:9090/alerts and Discord side by side, then follow the three scenarios in [`monitoring/README.md`](../monitoring/README.md#incident-simulation-for-the-demo-video): stop the database, send a burst of failing bookings, and stop the API. Each alert fires, is sent to Discord, and resolves by itself when you recover the system.

## D. Evidence checklist for the report

| Rubric area | Screenshot or evidence |
| ----------- | ---------------------- |
| Pipeline completeness | Jenkins Stage View, all seven green |
| Build | `build-info.txt` artifact; the registry catalog at http://localhost:5000/v2/_catalog; the GitHub release page |
| Test | Jenkins **Tests** and **Coverage** pages |
| Code quality | SonarQube overview, the quality gate conditions, and the **Activity** history (failed gate, then fixed) |
| Security | A failed run with findings (e.g. build #5), the later green run, and the `security-report.md` artifact |
| Deploy | Deploy stage log with the smoke test PASS lines; the rollback run from section B |
| Release | `release-info.txt`, the Git tag, the GitHub release, the production site |
| Monitoring | Grafana dashboard, `/alerts` page, a Discord alert, the firing and resolved incident |
