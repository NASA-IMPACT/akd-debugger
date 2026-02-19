# AKD

LLM Agent Benchmarking Platform — define suites, run agents, grade outputs, and compare results.

Make sure docker is installed and running

Install npm: 

`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash`

`nvm install node`


### Run Application 

start.sh

Visit: [localhost:3000](http://localhost:3000)

Backend API: [localhost:8000/docs](http://localhost:8000/docs)

### PostgreSQL backup and restore

Create a backup dump from your current database:

```bash
./scripts/pg_dump_to_file.sh
```

Optional custom output filename:

```bash
./scripts/pg_dump_to_file.sh backup_20260213.dump
```

Transfer dump file to your AWS VM:

```bash
scp backup_20260213.dump ec2-user@<EC2_PUBLIC_IP>:/tmp/
```

Restore on AWS VM (set connection vars if your DB host/port/user differs):

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=benchmark PGUSER=postgres PGPASSWORD=postgres \
./scripts/pg_restore_from_file.sh /tmp/backup_20260213.dump
```

### Docker-only backup and restore (easiest)

Create dump from the docker-compose Postgres service:

```bash
./scripts/pg_dump_docker.sh backup_20260213.dump
```

Copy dump to EC2:

```bash
scp backup_20260213.dump ec2-user@<EC2_PUBLIC_IP>:/tmp/
```

On EC2, in project directory (where `docker-compose.yml` exists), restore to docker Postgres:

```bash
./scripts/pg_restore_docker.sh /tmp/backup_20260213.dump
```
