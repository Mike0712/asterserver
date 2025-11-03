# Aster API

Express + TypeScript API skeleton

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Configuration

Create `.env` file:

```bash
PORT=3000
ALLOWED_IPS=127.0.0.1,::1,192.168.1.100
```

`ALLOWED_IPS` - comma-separated list of allowed IPs. Empty = allow all.

## Project Structure

```
src/
  routes/
    add.ts      # Add endpoint
  index.ts      # Entry point
```

## Features

- IP whitelist middleware (configurable via ALLOWED_IPS)
- Modular routing structure
- TypeScript support
- Hot reload in development

