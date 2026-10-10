// 测试 Seed-2.0-pro 速度
const API_KEY = process.env.DOUBAO_API_KEY || '';
const MODEL = 'ep-m-20260303172103-glznx';
const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

const fs = require('fs');
const path = require('path');

async function test() {
  // 读取一个真实的知识点来测试
  const topicsPath = path.join(__dirname, 'data', 'topics.json');
  const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
  const topic = topicsData.topics[20]; // 选第21个，有一定长度的

  console.log('🧪 测试 Seed-2.0-pro 翻译速度...');
  console.log('知识点:', topic.name);
  console.log('');
  
  const systemPrompt = `你是专业的儿童教育内容翻译专家。将下面的英文知识点翻译成简体中文。只输出JSON。
JSON格式：{"id":"原ID","name":"中文名","description":"中文描述","evidence":["..."],"subject_zh":"学科","domain_zh":"领域"}`;

  const userContent = `ID: ${topic.id}
学科: ${topic.subject}
领域: ${topic.domain}
年龄: ${topic.ageRangeStart}-${topic.ageRangeEnd}岁
名称: ${topic.name}
描述: ${topic.description}
掌握标准:
${topic.evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

  const startTime = Date.now();
  
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (!response.ok) {
      const text = await response.text();
      console.log('❌ 失败:', response.status, text.substring(0, 200));
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log(`✅ 成功! 用时: ${elapsed}秒`);
    console.log('');
    console.log('翻译结果:');
    console.log(content.substring(0, 300));
    console.log('...');
    
  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`❌ 失败 (${elapsed}秒):`, e.message);
  }
}

test();
