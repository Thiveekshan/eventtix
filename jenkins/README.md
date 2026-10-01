# Jenkins

Jenkins runs in Docker, with the Docker CLI and Node.js added so the pipeline can build images and run tests.

```
docker compose up -d --build     # first build takes several minutes
```

Open http://localhost:8083. Find the first-time admin password with:

```
docker compose logs jenkins
```

Stop it with `docker compose down` (your jobs and settings are kept in the `jenkins_home` volume; add `-v` only if you want to delete them).
