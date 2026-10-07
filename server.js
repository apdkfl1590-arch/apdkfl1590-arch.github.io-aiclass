import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(projectRoot, '.env') });

// 환경 변수에서 GEMINI_API_KEY 불러오기
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. 환경 변수(.env 또는 Render 환경 설정)에 키를 입력해주세요.');
}

const app = express();
// Gemini 클라이언트 초기화
const ai = new GoogleGenAI({ apiKey: apiKey });

const pages = ['admin_ai.html', 'worker_ai.html', 'guide.html'];

app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
});

app.get('/', (_req, res) => {
    res.sendFile(resolve(projectRoot, 'index.html'));
});

for (const page of pages) {
    app.get(`/${page}`, (_req, res) => {
        res.sendFile(resolve(projectRoot, page));
    });
}

app.use(express.json({ limit: '10mb' }));

const MODEL_CANDIDATES = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
];

async function generateWithFallback(payloadBase) {
    let lastError;
    for (const model of MODEL_CANDIDATES) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                return await ai.models.generateContent({
                    ...payloadBase,
                    model,
                });
            } catch (error) {
                lastError = error;
               const busy =
          error?.status === 503 ||
          error?.status === 404 ||
          /high demand|UNAVAILABLE|overloaded|no longer available|NOT_FOUND/i.test(
            String(error?.message || '')
          );
                if (busy && attempt < 2) {
                    await new Promise((r) => setTimeout(r, 800 * attempt));
                    continue;
                }
                if (busy) break;
                throw error;
            }
        }
    }
    throw lastError;
}

app.post('/api/weld-predict', async (req, res) => {
    try {
        const { image, processType } = req.body ?? {};
        const supportedProcesses = new Set(['SMAW', 'GMAW', 'GTAW', 'FCAW', 'SAW']);

        if (typeof image !== 'string' || !image.trim()) {
            return res.status(400).json({ error: '분석할 용접 이미지 데이터가 없습니다.' });
        }
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
            return res.status(400).json({ error: '이미지 데이터 형식이 올바르지 않습니다.' });
        }
        if (processType !== undefined && !supportedProcesses.has(processType)) {
            return res.status(400).json({ error: '지원하지 않는 용접 공법입니다.' });
        }

        const selectedProcess = processType || 'SMAW';

                const systemInstruction = `너는 용접 품질 검사관이다. 사용자가 제공하는 용접 비드 사진과 공법(${selectedProcess})을 바탕으로 품질을 검사해라.
결과는 반드시 순수한 JSON 한 개만 반환해라. 마크다운 코드블록(\`\`\`)이나 설명 문장은 절대 넣지 마라.

반드시 아래 키를 모두 포함해라:
{
  "score": 0부터 100 사이 숫자,
  "badgeText": "PASS (합격)" 또는 "REWORK (재작업)" 또는 "FAIL (불합격)",
  "title": "한 줄 제목",
  "desc": "상세 설명",
  "beadWidth": "예: 92.4 %",
  "roughness": "예: Ra 3.2 µm",
  "defectRate": "예: 2.1 %",
  "defects": [
    {"name": "결함명", "loc": "위치", "risk": "Low 또는 Medium 또는 High", "severity": "Low 또는 High"}
  ],
  "causes": ["원인1", "원인2"],
  "recommendations": ["조치1", "조치2"],
  "tutorFeedback": "작업자에게 전달할 짧은 피드백 2~3문장"
}

중요 규칙:
- causes, recommendations는 반드시 문자열 배열이다. 한 줄 문자열이나 객체로 쓰지 마라.
- causes와 recommendations는 각각 2~4개 항목을 넣어라.
- 공법 ${selectedProcess} 기준으로 구체적 원인과 현장 조치/파라미터 수정을 적어라.
- 결함이 거의 없어도 유지·점검 포인트를 causes/recommendations에 넣어라.`;

        const chatResp = await generateWithFallback({
            contents: [
                {
                    text: `현재 적용된 용접 공법은 ${selectedProcess}이다. 이 용접 사진의 품질을 정밀 진단해 줘.`
                },
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: image
                    }
                }
            ],
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.2,
                maxOutputTokens: 500,
                responseMimeType: 'application/json'
            }
        });

        const jsonText = chatResp.text;
        if (typeof jsonText !== 'string' || !jsonText.trim()) {
            throw new Error('AI 분석 결과가 비어 있습니다.');
        }

        const cleanJsonText = jsonText.trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '');

        res.json(JSON.parse(cleanJsonText));
    } catch (error) {
        console.error('AI 분석 서버 오류:', error);
        res.status(500).json({ error: 'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
    }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => {
    console.log(`WELD-AI server listening on port ${port}`);
});