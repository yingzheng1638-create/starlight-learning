// 简单测试脚本 - 验证 API 是否能正常调用
const API_KEY = process.env.DOUBAO_API_KEY || '';
const MODEL = 'doubao-seed-evolving';
const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

async function test() {
  if (!API_KEY) {
    console.log('❌ 没有 API Key');
    process.exit(1);
  }

  console.log('🧪 测试 API 调用...');
  console.log('模型:', MODEL);
  console.log('Key:', API_KEY.substring(0, 10) + '...');
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30秒超时
    
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'user', content: '你好，请说"测试成功"' }
        ],
        temperature: 0.3,
        max_tokens: 100
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    
    console.log('状态码:', response.status);
    
    if (!response.ok) {
      const text = await response.text();
      console.log('错误响应:', text.substring(0, 500));
    } else {
      const data = await response.json();
      console.log('✅ 成功!');
      console.log('回复:', data.choices?.[0]?.message?.content);
    }
  } catch (e) {
    console.log('❌ 失败:', e.message);
    if (e.name === 'AbortError') {
      console.log('   (请求超时了)');
    }
  }
}

test();
