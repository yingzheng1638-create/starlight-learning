// 从 translate-progress.json 生成 topics.zh.json
const fs = require('fs');
const path = require('path');

const progressPath = path.join(__dirname, 'data', 'translate-progress.json');
const topicsPath = path.join(__dirname, 'data', 'topics.json');
const outputPath = path.join(__dirname, 'data', 'topics.zh.json');

const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));

let successCount = 0;
let failCount = 0;

const zhTopics = topicsData.topics.map(topic => {
  const translated = progress[topic.id];
  if (translated && translated.name) {
    successCount++;
    return {
      ...topic,
      name: translated.name,
      description: translated.description || topic.description,
    };
  } else {
    failCount++;
    return topic; // 翻译失败的保留原文
  }
});

const result = {
  ...topicsData,
  topics: zhTopics,
};

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

console.log(`✅ 生成完成！成功: ${successCount}, 失败: ${failCount}`);
console.log(`📄 文件: ${outputPath}`);
