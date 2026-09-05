# Secure Android WebView Chat

> **Conteúdo Educativo** - Projeto de estudo sobre criptografia ponta-a-ponta (E2E), comunicação WebSocket segura, arquitetura relay e hardening de WebView no Android.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Kotlin](https://img.shields.io/badge/Kotlin-1.8+-7F52FF?style=flat-square&logo=kotlin&logoColor=white)](https://kotlinlang.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-E2E-010101?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](#)

## Sobre o Projeto

O **Secure Android WebView Chat** é um sistema completo de chat criptografado ponta-a-ponta (E2E) projetado para ser incorporado diretamente no `WebView` de um aplicativo Android. O projeto foi desenvolvido para fins de **estudo e aprendizado** sobre:

### Objetivo Educativo

- **Criptografia E2E** com AES-GCM (256-bit) e PBKDF2 (600.000 iterações)
- **Zero Persistence** - Sem banco de dados, salas auto-destrutivas, senhas nunca enviadas pela rede
- **Anti-Bot** com rate-limiting por sliding window e Proof-of-Work (hashcash)
- **Proteção contra replay attacks** com cache de nonces e janela temporal
- **Tráfego neutro (Chaffing)** - Pacotes dummy para mascarar padrões de comunicação
- **Hardenning de WebView** no Android com best practices de segurança
- **Arquitetura relay** estilo Signal com salas de uso único
- **Honeypot/tarpit** para atrapalhar scanners automáticos

### Funcionalidades

- Criptografia ponta-a-ponta com Web Crypto API
- Salas de uso único (burn on read)
- Rate-limiting com PoW para anti-flood
- Chaffing (tráfego dummy) para anti-análise
- Detecção de replay attacks
- Proxy SOCKS5/Tor no Android
- Layout responsivo para mobile
- Easter egg admin (3 cliques)

## Arquitetura

```
┌─────────────┐     WebSocket      ┌─────────────┐     WebSocket      ┌─────────────┐
│   Admin      │ ◄─────────────── │   Relay     │ ◄─────────────── │   Guest     │
│   (App)      │   E2E Encrypted  │   (Server)  │   E2E Encrypted  │   (Web)     │
└─────────────┘                    └─────────────┘                    └─────────────┘
                                         │
                                    ┌────┴────┐
                                    │ AntiBot  │
                                    │ RateLim  │
                                    │ Honeypot │
                                    └─────────┘
```

**Fluxo:**
1. Admin cria sala → recebe salt + credenciais
2. Guest entra via link → recebe salt → deriva chave E2E
3. Mensagens são criptografadas no cliente → relay apenas encaminha
4. Ao sair, sala é destruída permanentemente (single-use)

## Tecnologias Utilizadas

### Backend (Node.js)
| Tecnologia | Uso |
|------------|-----|
| Node.js 18+ | Runtime |
| WebSocket (`ws`) | Comunicação tempo real |
| Crypto (native) | Anti-bot, PoW, hashing |

### Frontend (Web)
| Tecnologia | Uso |
|------------|-----|
| Web Crypto API | AES-GCM 256-bit, PBKDF2 |
| JavaScript ES6+ | Lógica da aplicação |
| HTML5/CSS3 | Interface responsiva |

### Android (Kotlin)
| Tecnologia | Uso |
|------------|-----|
| Kotlin | Linguagem nativa |
| WebView | Renderização web |
| AndroidX WebKit | Proxy SOCKS5 |

## Como Rodar

### Pré-requisitos
- Node.js 18+
- Android Studio (para teste no emulador/dispositivo)

### Passo 1: Iniciar o Backend

```bash
cd backend
npm install
npm start
```

O servidor WebSocket inicia na porta `3000`.

### Passo 2: Testar no Navegador

Abra `frontend/index.html` no navegador.

> Para testar localmente, altere `WS_URL` em `frontend/app.js` para `ws://localhost:3000`.

### Passo 3: Deploy no Android

1. Crie um projeto "Empty Activity" no Android Studio
2. Copie o conteúdo de `frontend/` para `app/src/main/assets/`
3. Substitua `MainActivity.kt` e `AndroidManifest.xml` pelos templates em `android_example/`
4. Se deploy em servidor público, atualize `WS_URL` em `app.js`
5. Execute no emulador ou dispositivo

## Estrutura do Projeto

```
Appadrnade/
├── README.md                    # Documentação
├── android_example/             # Templates Android
│   ├── AndroidManifest.xml      # Manifest com permissões mínimas
│   └── MainActivity.kt          # WebView hardening + proxy SOCKS5
│
├── backend/                     # Servidor relay
│   ├── server.js                # Bootstrap do WebSocket server
│   ├── RelayManager.js          # Lógica de relay + auth admin
│   ├── RoomState.js             # Gerenciamento de salas single-use
│   ├── AntiBot.js               # Rate-limiting + PoW + anti-duplicate
│   ├── package.json             # Dependências Node.js
│   └── trusted_admins.json      # Dispositivos confiáveis (Master)
│
├── frontend/                    # Cliente web (vai para Android assets)
│   ├── index.html               # Tela de login/join
│   ├── app.html                 # Tela principal do chat
│   ├── app.js                   # Controller UI + fluxos admin/guest
│   ├── crypto.js                # Criptografia E2E (AES-GCM + PBKDF2)
│   ├── network.js               # State machine WebSocket + reconnect
│   ├── style.css                # Estilos responsivos
│   ├── sys_auth.html            # Página fake (redireciona para app)
│   ├── node_res.html            # Página fake (redireciona para app)
│   ├── config_v2_res.bin.html   # Página fake (redireciona para app)
│   └── health_status.json.html  # Página fake (redireciona para app)
│
└── node_modules/                # Dependências (git ignored)
```

## Conceitos de Segurança Estudados

### Criptografia
- **AES-GCM 256-bit**: Encriptação autenticada com IV único por mensagem
- **PBKDF2 600k iterações**: Derivação de chave resistente a brute-force
- **Padding uniforme**: Pacotes de tamanho fixo para anti-DPI

### Anti-Bot
- **Sliding Window Rate Limiting**: Controle de taxa por janela deslizante
- **Proof-of-Work (Hashcash)**: Desafio computacional para desbanir
- **Cache de payloads**: Detecção de mensagens duplicadas

### Anti-Analysis
- **Chaffing**: Pacotes dummy para mascarar tráfego real
- **Cache de nonces**: Prevenção contra replay attacks
- **Janela temporal**: Rejeição de mensagens antigas (>60s)
- **UUID tracking**: Prevenção contra replay de UUIDs

### Honeypot
- Salas com nomes comuns (`admin`, `root`, `test`) retornam respostas falsas
- Delay artificial (5-10s) para desperdiçar tempo de scanners
- PoW com dificuldade alta (8 zeros) para consumir CPU

### Android Hardening
- `allowFileAccess = false`
- `allowContentAccess = false`
- `setSupportMultipleWindows(false)`
- `javaScriptCanOpenWindowsAutomatically = false`
- Anti-Intent-Hijacking (`shouldOverrideUrlLoading = true`)
- Detecção automática de SOCKS5 (Orbot/Tor)
- Fallback automático para clearnet

## Credenciais de Demonstração

| Credencial | Valor |
|------------|-------|
| Admin Password | `admin123` |
| Admin Token | `token123` |

> ⚠️ Em produção, use variáveis de ambiente para credenciais.

## Melhorias Sugeridas para Produção

| Aspecto | Este Projeto | Produção Recomendada |
|---------|-------------|---------------------|
| Credenciais | Hardcoded | Variáveis de ambiente |
| TLS | Não implementado | Certificado SSL obrigatório |
| Storage | Em memória | Redis/DB persistente |
| Auth | Token fixo | JWT com expiração |
| Rate Limit | Em memória | Redis distribuído |

## Aviso Legal

> ⚠️ Este projeto é **exclusivamente educacional**. Foi desenvolvido para estudar conceitos de segurança, criptografia e comunicação segura. Não deve ser utilizado para atividades ilegais.

## Autor

**Rafael Melinsky** - Desenvolvedor Full Stack

- GitHub: [@melinskyRf](https://github.com/melinskyRf)
- Site: [devmelinsky.site](https://devmelinsky.site)

---

> 📚 **Conteúdo Educativo** - Segurança through criptografia.
