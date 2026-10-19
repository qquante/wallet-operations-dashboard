> Historical project notes. Paths, operational status, badges and test claims below are retained as archival reference and have not all been revalidated. Use the root README and docs/REVIEW.md for this review snapshot.

# Bune Wallet Manager

Dashboard local para management de wallets na BNB Chain. O V1 é simples e direto para localhost: cria/importa wallets, guarda private keys no SQLite local, reserva wallets em grupos, acompanha saldo BNB e monta planos de envio BNB em dry-run. Não há compra, venda, criação de token ou broadcast real no V1.

## Requisitos

- Node.js 24+
- Docker dos nodes já rodando com `nodes-dashboard` em `http://localhost:8080/api/data`
- BSC nodes saudáveis com `chainId = 56` e WebSocket ativo

## Rodar

```powershell
npm install
npm run dev
```

URLs:

- UI: `http://127.0.0.1:8789`
- API: `http://127.0.0.1:8790`

Build/produção local:

```powershell
npm run build
npm start
```

Depois abra `http://127.0.0.1:8790`.

Opcional em `.env`:

```env
ETHERSCAN_API_KEY=coloque_sua_key_aqui
```

O backend carrega `.env` local no start. Com essa key, `Ler tx` usa Etherscan API V2 (`chainid=56`) como enriquecimento read-only alem dos seus nodes RPC/WS.

## Verificar nodes

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8080/api/data
docker exec nodes-monitor python auditoria.py
```

O app bloqueia refresh/plano se não encontrar BSC saudável (`chainId 56`, `healthy=true`, `ws_subscribe=true`).

## Segurança do V1

- Private keys ficam no SQLite local em `data/bune.sqlite`.
- Não há login, unlock ou vault no fluxo normal.
- Private keys não aparecem na listagem principal.
- Export CSV bruto existe para backup/migração e gera evento auditável.
- Se houver keys antigas do primeiro formato cifrado, use o botão "Converter keys antigas" uma vez com a senha antiga.
- O watcher live abre até 3 WebSockets BSC saudáveis do `nodes-dashboard` ao mesmo tempo.
- O V1 não chama `sendRawTransaction`, `sendTransaction` ou `broadcastTransaction`.
- Plano BNB é apenas dry-run: estima gas e mostra se cada wallet consegue pagar valor + gas.

## DEV wallets, historico e Four.meme

- Aba `DEV`: configure uma ou mais dev wallets em slots `D1..D20`, com role e notas.
- `D1..D20` sao unicos: se voce mover `D1` para outra wallet, a antiga perde o slot.
- Tags ficam separadas do nome da wallet para nao poluir label. Use tags como `dev`, `camp:nome`, `bag:ticker`, `token:0x1234abcd`.
- Historico por wallet registra reserva/liberacao, mudanca de tags, selecao de dev wallet e fila de launch dry-run.
- `Refresh bag` atualiza posicoes por token: balance, USD, cost basis e PnL por wallet.
- `Salvar ledger` na fila LAUNCH grava as primeiras compras planejadas como fills locais (`planned`, `launch_dry_run`), sem assinatura e sem broadcast.
- `Manual fill / confirm planned` permite registrar buy/sell manual e transformar um planned fill em `confirmed` com `txHash` e quantidade real.
- `Ler tx` faz preview read-only do `txHash` via RPC BSC: busca transaction/receipt, decodifica logs ERC-20 `Transfer`, sugere side/quantidade/BNB/USD e preenche o form antes da confirmacao.
- Se `ETHERSCAN_API_KEY` estiver configurada, `Ler tx` tambem consulta Etherscan V2 para `txlistinternal` por hash e `tokentx` por wallet/bloco, melhorando proceeds de venda e transfers indexados.
- O preview de USD usa preco atual do BNB quando calcula BNB->USD; ainda nao e preco historico do bloco.
- Venda que paga BNB nativo via internal transfer pode nao expor proceeds no receipt padrao; nesses casos o app preenche quantidade e deixa USD para revisao manual.
- O ledger de posicao separa:
  - `position_fills`: buy/sell planejado, simulado, confirmado ou importado, com origem, wallet, grupo, campaign, BNB, USD e txHash opcional;
  - `position_lots`: lotes abertos FIFO para cost basis e PnL realizado em venda;
  - `position summary`: PnL por wallet/token/grupo/PRIME usando cost basis salvo + bag live.
- A bag live continua lendo saldo on-chain; quando existe ledger para wallet/token, o cost basis vem dele. Sem ledger, o fallback antigo por BNB planejado ainda funciona.
- Preco de token usa lifecycle Four.meme + mercado publico:
  - token em bonding/pre-DEX (`PUBLISH` ou `progress < 1`): fonte primaria Four.meme `tokenPrice.price`, `marketCap`, `progress`;
  - token graduado/TRADE: fonte primaria Dexscreener, fallback CoinGecko Onchain, mantendo status/progress Four.meme como contexto;
  - cada sync grava snapshot local em `token_price_snapshots` para historico.
- `LAUNCH` permite selecionar a dev wallet criadora e sincronizar config Four.meme read-only.
- `TOKEN DRAFT` salva drafts no SQLite com campaign, grupos, dev wallet, metadata, raised token e snapshot do payload.
- `Create dry-run` separa os controles de auth, upload de imagem, create API e factory tx. Tudo fica `willCall=false`/`willBroadcast=false` no V1.
- Draft salvo registra triggers locais: metadata, associacao de grupo, dev wallet auth, image upload, create API e factory tx bloqueada.
- Token address fica como `pos-create`: so entra depois que o token existir e e usado para fila de primeiras compras/bag live.
- Endpoints read-only Four.meme: `GET /api/four-meme/config`, `POST /api/four-meme/search`, `GET /api/four-meme/token/:address`.
- Endpoints read-only de preco: `GET /api/market/bnb-price`, `GET /api/market/token-price/:address`, `GET /api/market/token-price/:address/snapshots`.
- BNB/USD historico: `GET /api/market/bnb-price-at?timestamp=<unix>` usa candle Binance Spot `BNBUSDT` 1m e grava cache local em `bnb_price_snapshots`.
- `Ler tx` usa o timestamp do bloco para calcular USD com BNB historico; se o candle nao estiver disponivel, usa BNB atual e mostra warning explicito.
- Lifecycle de token: cada sync de `token-price` grava fase `four_meme_bonding`, `dex_trading` ou `unknown` no metadata do snapshot.
- Four.meme trade dry-run: `POST /api/four-meme/trade-dry-run` le Helper3 (`getTokenInfo`, `tryBuy`, `trySell`), monta calldata unsigned para TokenManager2 e tenta `estimateGas`/`eth_call` com a wallet informada. Nao assina, nao envia e nao chama `sendRawTransaction`.
- Execution planner: `POST /api/four-meme/execution-plan` gera sequencia por grupo/wallet com PRIME primeiro, nonce estimado, gas total, BNB necessario, slippage por wallet e `blockedForBroadcast=true`.
- Execution plans salvos: `POST /api/four-meme/execution-plans` persiste o plano dry-run com `version` e `planHash` SHA-256; `GET /api/four-meme/execution-plans` lista; `POST /api/four-meme/execution-plans/:id/review` recalcula o plano contra RPC live e retorna diff antes de qualquer modo real; `POST /api/four-meme/execution-plans/:id/archive` arquiva.
- Review final compara hash salvo vs live, ordem das wallets, nonce, saldo BNB, status, gas, calldata e valor. Mesmo revisado continua `broadcast=false` e `blockedForBroadcast=true`.
- Final confirmation: `GET /api/four-meme/execution-plans/:id/final-confirmation` prepara a frase/checks; `POST /api/four-meme/execution-plans/:id/final-confirmation` grava tentativa auditavel. Exige review live limpo e frase dinamica, mas ainda retorna `realModeEnabled=false`, `broadcast=false`, `blockedForBroadcast=true`.
- Readiness probe: `POST /api/wallets/watch-only` cadastra address publico sem private key para provar `estimateGas`/`eth_call` e deixar row `ready_dry_run`. Essa wallet nao assina, nao exporta CSV e nao representa wallet executavel.
- Endpoints locais de tx/posicao/PnL: `POST /api/tx/preview`, `GET /api/positions/fills`, `POST /api/positions/fills`, `POST /api/positions/fills/bulk`, `POST /api/positions/fills/:id/confirm`, `GET /api/positions/summary`.
- Endpoints locais de launch draft: `GET /api/launch-drafts`, `POST /api/launch-drafts`, `POST /api/launch-drafts/:id/prepare-create-dry-run`, `POST /api/launch-drafts/:id/archive`.
- Endpoints locais de controle: `GET /api/dev-wallets`, `POST /api/wallets/watch-only`, `POST /api/wallets/:id/dev`, `POST /api/wallets/:id/tags`, `GET /api/wallet-history`, `GET /api/wallet-token-positions`.
- Ainda nao ha assinatura, createToken on-chain, compra, venda ou broadcast real.

## Terminal control

- Aba `TOKENS`: registra campaigns e tokens. Token address pode ficar vazio em pre-launch e ser preenchido depois do create real.
- Aba `TASKS`: cria unidades dry-run como `four_meme_create`, `first_buy`, `sell_prime`, `volume`, `bump`, `fund`, `withdraw` e prepara fila sem assinatura.
- Aba `AUTO`: registra gatilhos locais (`manual`, `delay`, `market_cap`, `profit`, `price`, `bonding_curve`) apontando para tasks. Ainda nao executa sozinho.
- Aba `BLUEPRINT`: salva templates de estrategia com slots de wallet, templates de task e settings.
- Aba `SETTINGS`: salva configs locais como RPC HTTP/WS, fee wallet, slippage default e presets.
- Endpoints locais:
  - `GET/POST /api/terminal/campaigns`
  - `GET/POST /api/terminal/tokens`
  - `GET/POST /api/terminal/tasks`
  - `POST /api/terminal/tasks/:id/prepare-dry-run`
  - `GET/POST /api/terminal/automations`
  - `POST /api/terminal/automations/:id/archive`
  - `GET/POST /api/terminal/blueprints`
  - `GET/POST /api/terminal/settings`
- Toda task preparada retorna `dryRunOnly=true` e `broadcastBlocked=true`.

## Gates

```powershell
npm run build
npm test
npm run check
```
