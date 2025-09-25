# 🚀 VPS Deployment Configuration

## Port Configuration Updated ✅

**MCP Oracle is now configured to use ports 4010 and 4011 for your VPS deployment.**

### Port Mapping
- **HTTP Server**: `4010` (previously 4006)
- **WebSocket Server**: `4011` (previously 4007)

### Quick Deployment Commands

#### Docker Compose (Recommended)
```bash
# Clone and deploy
git clone https://github.com/KaayaanAi/MCP-Oracle.git
cd MCP-Oracle
cp .env.example .env
# Edit .env with your API keys
nano .env
docker-compose up -d
```

#### Manual Deployment
```bash
# Install and run
npm install
npm run build
PORT=4010 WS_PORT=4011 npm start
```

### Service URLs on Your VPS
- **Health Check**: `http://your-vps-ip:4010/health`
- **HTTP API**: `http://your-vps-ip:4010/mcp`
- **WebSocket**: `ws://your-vps-ip:4011`

### Firewall Configuration
Make sure to open these ports on your VPS:
```bash
# Ubuntu/Debian
sudo ufw allow 4010
sudo ufw allow 4011

# CentOS/RHEL
sudo firewall-cmd --add-port=4010/tcp --permanent
sudo firewall-cmd --add-port=4011/tcp --permanent
sudo firewall-cmd --reload
```

### Docker Port Mapping Verification
```bash
# Check containers are running with correct ports
docker ps | grep mcp-oracle
# Should show: 0.0.0.0:4010->4010/tcp, 0.0.0.0:4011->4011/tcp
```

### Health Check Verification
```bash
# Test from your local machine
curl http://your-vps-ip:4010/health
# Expected: {"status":"healthy","timestamp":"..."}
```

---

**✅ All configuration files updated and tested. Ready for VPS deployment!**