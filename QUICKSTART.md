# Quick Start Guide

## Prerequisites Check

```powershell
# Check Rust
rustc --version

# Check Node.js
node --version

# Check pnpm
pnpm --version

# Check Helm
helm version

# Check Kubernetes access
kubectl cluster-info
```

## Run the App

```powershell
cd c:\Users\riley\Documents\programming\rudder
pnpm tauri dev
```

## Test with a Sample Chart

If you don't have any Helm releases yet:

```bash
# Add Bitnami repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Install a simple chart with schema
helm install my-nginx bitnami/nginx

# View in Rudder
# The app will automatically show your release
# Click "Edit" to see the schema-generated form
```

## Troubleshooting

**Port 1420 already in use?**
```powershell
# Find and kill the process
Get-Process -Id (Get-NetTCPConnection -LocalPort 1420).OwningProcess | Stop-Process
```

**Vite not starting?**
```powershell
# Clear node_modules and reinstall
Remove-Item -Recurse -Force node_modules
pnpm install
```

**Cargo build errors?**
```powershell
cd src-tauri
cargo clean
cargo build
```

## Key Features to Test

1. **Dashboard** - See all releases in a table
2. **Refresh** - Click refresh to reload releases
3. **Edit** - Click edit on a release (needs chart with values.schema.json)
4. **Form Generation** - Watch the form build from schema
5. **Upgrade** - Change values and click "Upgrade Release"
6. **Error Handling** - Try with a chart that has no schema

## Example Schema-Enabled Charts

These charts include values.schema.json:
- `bitnami/redis`
- `bitnami/postgresql`
- `bitnami/nginx`
- `bitnami/mysql`

Install one to see the full form generation in action!
