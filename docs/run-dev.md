# Run dev build

``` bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down && docker compose up -d --build
```