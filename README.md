# Rumo Certo

Copiloto de carreira para adolescentes portugueses do 9.º ao 12.º ano. Questionário curto que devolve 3-5 caminhos profissionais com cursos, profissões, médias de entrada e próximos passos. Inclui chatbot integrado para esclarecer dúvidas.

## Estrutura do projeto

```
rumo-certo/
├── index.html                      ← Site (HTML/CSS/JS puro)
├── netlify.toml                    ← Configuração da Netlify
├── package.json                    ← Metadados (versão node, scripts)
├── .gitignore
└── netlify/
    └── functions/
        └── chat.js                 ← Proxy serverless para OpenAI
```

## Como pôr online (Netlify)

### 1. Push para o GitHub

Cria um repositório novo no GitHub e faz push de toda esta pasta:

```bash
cd rumo-certo
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/teu-user/rumo-certo.git
git push -u origin main
```

### 2. Conectar à Netlify

1. Vai a [app.netlify.com](https://app.netlify.com) e faz login
2. Clica em **Add new site → Import an existing project**
3. Liga ao GitHub e escolhe o repositório `rumo-certo`
4. As definições de build são detetadas automaticamente a partir do `netlify.toml`:
   - **Publish directory**: `.`
   - **Functions directory**: `netlify/functions`
5. Clica em **Deploy site**

### 3. Adicionar a API key da OpenAI

**ESTE PASSO É OBRIGATÓRIO** para o chatbot funcionar.

1. Em [platform.openai.com/api-keys](https://platform.openai.com/api-keys) cria uma key
   (precisa de cartão associado; usa o gpt-4o-mini para gastar pouco)
2. No painel da Netlify do teu site:
   **Site settings → Environment variables → Add a variable**
   - **Key**: `OPENAI_API_KEY`
   - **Value**: `sk-...` (cola a key que copiaste)
3. Faz um **novo deploy** para a função carregar a variável
   (Deploys → Trigger deploy → Deploy site)

### 4. (Opcional) Domínio personalizado

Em **Site settings → Domain management** podes apontar um domínio teu, ou usar o subdomínio `*.netlify.app` gratuito.

## Desenvolvimento local

Para testar localmente com as funções a funcionar (precisa da Netlify CLI):

```bash
npm install
# Cria um ficheiro .env na raiz com:
#   OPENAI_API_KEY=sk-...
npm run dev
```

Abre [http://localhost:8888](http://localhost:8888). A função fica em `/.netlify/functions/chat`.

## Custos da OpenAI

O modelo `gpt-4o-mini` (configurado em `netlify/functions/chat.js`) custa aproximadamente:
- **$0.15** por 1M tokens de input
- **$0.60** por 1M tokens de output

Cada conversa típica do chatbot usa ~1000-3000 tokens, ou seja menos de **$0.002 por conversa**. Mesmo com 1000 utilizadores por dia, o custo mensal fica abaixo de **$60**.

Para reduzir custos, podes ajustar `MAX_TOKENS` em `chat.js` (atualmente 500).

## Limites de segurança implementados

- API key escondida do browser (vive como variável de ambiente no servidor)
- Limite máximo de 30 mensagens por conversa
- Limite de 4000 caracteres por mensagem individual
- Modelo `gpt-4o-mini` em vez do GPT-4o (10x mais barato)
- Limite de tokens de saída (500)

Para tráfego elevado, considera adicionar **rate limiting** por IP — a Netlify tem isto integrado em planos pagos.

## Próximos passos sugeridos

- [ ] Persistência das conversas (Supabase ou Netlify Blobs)
- [ ] Streaming das respostas (em vez de esperar pelo response completo)
- [ ] Captcha no primeiro pedido para evitar abuso
- [ ] Analytics simples (PostHog ou Plausible)
- [ ] Mover SVG da paisagem para ficheiro separado (reduz tamanho do HTML)
