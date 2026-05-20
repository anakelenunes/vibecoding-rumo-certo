/**
 * Netlify Function: chat
 * ----------------------------------------------------------------
 * Faz proxy para a API da OpenAI Chat Completions.
 *
 * Porque é que precisamos disto?
 * ------------------------------
 * A API key da OpenAI NUNCA pode estar no JavaScript do browser
 * (qualquer pessoa que abra DevTools pode roubá-la e gastar
 * dinheiro na nossa conta). Em vez disso, o browser chama esta
 * função (que corre no servidor da Netlify), e a função usa a
 * key — que vive numa variável de ambiente — para falar com a
 * OpenAI.
 *
 * Como configurar a API key
 * --------------------------
 * 1. Vai a https://platform.openai.com/api-keys e cria uma key
 * 2. No painel da Netlify do teu site:
 *    Site settings → Environment variables → Add a variable
 *    Key:   OPENAI_API_KEY
 *    Value: sk-...
 * 3. Faz um novo deploy para que a função leia a key
 *
 * Endpoint
 * --------
 * POST /.netlify/functions/chat
 * Body JSON: {
 *   messages: [{ role: "user"|"assistant", content: "..." }, ...],
 *   userProfile: { ... } | null   // perfil do quiz, opcional
 * }
 * Resposta: { reply: "...", usage: {...} }
 */

// Modelo a usar. gpt-4o-mini é o mais barato e rápido da OpenAI,
// suficiente para conversas de orientação profissional.
const MODEL = 'gpt-4o-mini';

// Limite máximo de tokens na resposta. ~500 tokens ≈ 350 palavras,
// é uma resposta longa mas razoável. Reduz se quiseres poupar.
const MAX_TOKENS = 500;

// Prompt de sistema: define a personalidade e regras do assistente.
// Mantém em português, foco em adolescentes portugueses, e
// importantíssimo: NUNCA inventa médias de entrada nem cursos.
const SYSTEM_PROMPT = `És o "Rumo Certo", um assistente de orientação profissional para adolescentes portugueses do 9.º ao 12.º ano.

A tua missão é ajudar a esclarecer dúvidas sobre cursos superiores, profissões, exames de acesso, e percursos académicos em Portugal.

REGRAS IMPORTANTES:
1. Fala em português europeu (de Portugal), tom amigável e empático mas sem ser infantil.
2. Sê CONCISO: respostas de 2 a 4 parágrafos curtos, salvo se a pergunta exigir mais.
3. NÃO inventes números: se não tens a certeza da média de entrada de um curso ou da nota de um exame, diz que recomendas verificar em fontes oficiais como DGES (dges.gov.pt) ou no site da universidade.
4. NÃO promovas uma carreira como "a melhor" — apresenta prós e contras.
5. Se o adolescente parece ansioso ou perdido, valida o sentimento antes de dar informação.
6. Se a pergunta sai do âmbito (saúde mental, problemas pessoais sérios), redireciona com cuidado para um adulto de confiança ou linhas de apoio (SOS Voz Amiga: 213 544 545).
7. Quando faz sentido, sugere próximos passos concretos (ex: "visita um dia aberto", "fala com um professor da área").
8. NÃO uses emojis em excesso. Um por mensagem, no máximo, e só se for natural.
9. Estrutura respostas longas com listas curtas ou parágrafos separados — facilita a leitura.`;

exports.handler = async (event) => {
  // CORS headers — permitir chamadas do próprio site
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Preflight CORS (browsers fazem isto antes do POST real)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Só aceitamos POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método não permitido. Usa POST.' }),
    };
  }

  // Verificar se a API key está configurada
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY não definida nas variáveis de ambiente');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'O servidor não tem a API key configurada. Verifica as Environment Variables na Netlify.',
      }),
    };
  }

  // Validar body da request
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'JSON inválido no body.' }),
    };
  }

  const { messages = [], userProfile = null } = payload;

  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Falta o array "messages" no body.' }),
    };
  }

  // Limite defensivo: não aceitar conversas demasiado longas (evita
  // que utilizadores maliciosos drenem a conta com prompts gigantes)
  if (messages.length > 30) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Conversa demasiado longa. Recarrega para começar de novo.' }),
    };
  }

  // Construir mensagens para a OpenAI:
  //   1. system prompt sempre primeiro
  //   2. contexto do perfil do utilizador (se fizeram o quiz)
  //   3. histórico da conversa
  const openAiMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  if (userProfile) {
    // Resumo do perfil em português, injetado como contexto adicional.
    // O modelo lê isto antes da pergunta e personaliza a resposta.
    const profileSummary = formatUserProfile(userProfile);
    openAiMessages.push({
      role: 'system',
      content: `Contexto sobre este utilizador (vem do questionário que ele já preencheu na app):\n\n${profileSummary}\n\nUsa este contexto para personalizar as tuas respostas, mas não o repitas de volta — assume que ele já sabe o que respondeu.`,
    });
  }

  // Anexar mensagens do utilizador. Sanitização ligeira: garantir
  // que só temos roles válidos e content é string.
  for (const msg of messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    if (typeof msg.content !== 'string' || !msg.content.trim()) continue;
    // Truncar mensagens individuais a 4000 chars (proteção)
    openAiMessages.push({
      role: msg.role,
      content: msg.content.slice(0, 4000),
    });
  }

  // Chamar a OpenAI
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: openAiMessages,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI error:', response.status, errText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'O serviço de chat está indisponível neste momento. Tenta novamente em alguns segundos.',
        }),
      };
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        reply,
        usage: data.usage, // útil para monitorizar custos
      }),
    };
  } catch (err) {
    console.error('Erro a chamar OpenAI:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Erro inesperado no servidor. Tenta novamente.',
      }),
    };
  }
};

/**
 * Formata o perfil do utilizador (vindo do quiz) num resumo legível
 * que o modelo consegue digerir. Recebe o objeto state da app.
 */
function formatUserProfile(p) {
  const lines = [];
  if (p.year) lines.push(`- Ano escolar: ${p.year}.º`);
  if (p.subjects?.length) lines.push(`- Disciplinas favoritas: ${p.subjects.join(', ')}`);
  if (p.activities?.length) lines.push(`- Gosta de: ${p.activities.join(', ')}`);
  if (p.preferences) {
    const prefs = Object.entries(p.preferences)
      .map(([k, v]) => `${k}=${v}/100`)
      .join(', ');
    lines.push(`- Preferências pessoais (0-100): ${prefs}`);
  }
  if (p.grade != null) lines.push(`- Média atual aproximada: ${p.grade}`);
  if (p.location) lines.push(`- Localização: ${p.location}`);
  if (p.educationType) lines.push(`- Prefere ensino: ${p.educationType}`);
  if (p.topCareers?.length) {
    lines.push(`- Caminhos recomendados pela app: ${p.topCareers.join(', ')}`);
  }
  return lines.join('\n');
}
