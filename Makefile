.PHONY: up down seed test backend-test frontend-build
up:
	docker compose up --build -d

down:
	docker compose down

seed:
	docker compose exec backend python -m app.seed

test: backend-test frontend-build

backend-test:
	PYTHONPATH=backend pytest -q backend/tests

frontend-build:
	cd frontend && npm install && npm run build
