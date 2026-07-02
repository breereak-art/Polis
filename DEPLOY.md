# Deploying Polis to Alibaba Cloud

One container serves everything on port 3000: the operations console (UI),
the REST API (`/api/tyr`, …) and the Colyseus WebSocket. The UI connects back
to the same origin automatically, so no extra config is needed.

## Prerequisites
- An Alibaba Cloud account (https://www.alibabacloud.com)
- Your Qwen / DashScope API key (Model Studio)

## Option A — ECS + Docker (recommended, ~15 min)

1. **Create the instance**
   Console → *Elastic Compute Service* → *Create Instance*:
   - Region: Singapore (or nearest to judges)
   - Instance: 2 vCPU / 4 GB (e.g. `ecs.e-c1m2.large`), Ubuntu 22.04/24.04
   - Assign a **public IPv4** address
   - Security group: allow inbound **TCP 80** (and 22 for SSH)

2. **SSH in and install Docker**
   ```bash
   ssh root@<PUBLIC_IP>
   curl -fsSL https://get.docker.com | sh
   ```

3. **Clone and configure**
   ```bash
   git clone https://github.com/breereak-art/Polis.git && cd Polis
   cat > .env <<'EOF'
   QWEN_API_KEY=<your DashScope key>
   QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode
   QWEN_MODEL=qwen-plus
   EOF
   ```
   (Domestic-region keys use `https://dashscope.aliyuncs.com/compatible-mode`.)

4. **Build and run**
   ```bash
   docker build -t polis .
   docker run -d --name polis --restart unless-stopped \
     -p 80:3000 --env-file .env \
     -v polis-data:/app/data \
     polis
   ```

5. **Verify**
   - Open `http://<PUBLIC_IP>` → the live console
   - `curl http://<PUBLIC_IP>/api/tyr` → trust ledger JSON
   - `docker logs -f polis` → `[think:…]` lines prove Qwen Cloud inference

## Option B — Serverless App Engine (no VM)
Push the image to *Container Registry* (ACR), then create a **SAE** application
from it: port 3000, 1 vCPU / 2 GB, env vars `QWEN_API_KEY` / `QWEN_BASE_URL` /
`QWEN_MODEL`, and enable a public SLB endpoint. Note: SQLite memory resets on
redeploy unless you attach NAS storage.

## Submission proof checklist
- [ ] Public URL of the running console
- [ ] Screenshot of the console live at that URL
- [ ] Screenshot of ECS/SAE resource page (shows it runs on Alibaba Cloud)
- [ ] `docker logs` excerpt showing `[think:…]` (Qwen Cloud inference)

## Local production sanity check
```bash
npm ci && npm run build
node packages/server/dist/index.js   # then open http://localhost:3000
```
