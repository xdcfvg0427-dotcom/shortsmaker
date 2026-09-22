"""Static cross-file validation for machines without a Docker daemon."""

from pathlib import Path
import yaml

root = Path(__file__).resolve().parents[1]
data = yaml.safe_load((root / "docker-compose.yml").read_text())
assert set(data["services"]) == {"migrate", "api", "renderer", "web"}
for name, service in data["services"].items():
    assert (root / service["build"]["context"] / "Dockerfile").is_file()
    for dependency in service.get("depends_on", {}):
        assert dependency in data["services"]
    if name != "web":
        assert service["environment"]["STORAGE_DIR"] == "/app/storage"
        assert "studio-data:/app/storage" in service["volumes"]
assert data["services"]["web"]["ports"] == ["127.0.0.1:8080:80"]
assert (root / "deploy/nginx.conf").is_file()
assert "FROM nginx:" in (root / "Dockerfile").read_text()
print("Compose YAML, shared configuration, dependencies, build targets and referenced files: valid.")
