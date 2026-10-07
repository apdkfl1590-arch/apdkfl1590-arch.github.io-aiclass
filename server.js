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
        
        // 시스템 지시사항 (System Instructions)
        const systemInstruction = `너는 용접 품질 검사관이다. 사용자가 제공하는 용접 비드 사진과 공법(${selectedProcess})을 바탕으로 품질을 검사해라. 결과는 반드시 순수한 JSON 형식으로만 반환해야 한다:
        {
          "score": 85,
          "badgeText": "PASS (합격)" 또는 "REWORK (재작업)" 또는 "FAIL (불합격)",
          "title": "용접 상태를 요약하는 한 줄 제목",
          "desc": "용접 상태에 대한 상세 설명",
          "beadWidth": "92.4 %",
          "roughness": "Ra 3.2 µm",
          "defectRate": "2.1 %",
          "defects": [
            {"name": "기공 또는 스패터 또는 언더컷 등", "loc": "발생 위치", "risk": "Low 또는 Medium 또는 High", "severity": "Low 또는 High"}
          ]
        }`;

        // Gemini 모델 호출 (gemini-3.8-flash 모델 사용)
        const chatResp = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: [
                {
                    text: `현재 적용된 용접 공법은 ${selectedProcess}이다. 이 용접 사진의 품질을 정밀 진단해 줘.`
                },
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: image // Base64 인코딩된 이미지 데이터
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