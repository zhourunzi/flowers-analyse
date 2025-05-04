const express = require('express');
const cors = require('cors');
const axios = require('axios');
const OSS = require('ali-oss');
const fileUpload = require('express-fileupload');
require('dotenv').config({ path: '1.env' });

const app = express();

app.use(cors());
app.use(express.json());
app.use(fileUpload());

// 从环境变量读取配置
const {
  BAIDU_API_KEY,
  BAIDU_SECRET_KEY,
  OSS_REGION,
  OSS_ACCESS_KEY_ID,
  OSS_ACCESS_KEY_SECRET,
  OSS_BUCKET
} = process.env;

let cachedToken = '';

async function refreshToken() {
  try {
    const res = await axios.post('https://aip.baidubce.com/oauth/2.0/token', null, {
      params: {
        grant_type: 'client_credentials',
        client_id: BAIDU_API_KEY,
        client_secret: BAIDU_SECRET_KEY
      }
    });
    cachedToken = res.data.access_token;
  } catch (error) {
    console.error('Token刷新失败:', error);
    throw error;
  }
}

// 植物识别接口
app.post('/api/plant', async (req, res) => {
  try {
    if (!cachedToken) await refreshToken();
    
    const response = await axios.post(
      'https://aip.baidubce.com/rest/2.0/image-classify/v1/plant',
      `image=${encodeURIComponent(req.body.image)}`,
      {
        params: { access_token: cachedToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('识别服务异常:', error);
    res.status(500).json({ error: '识别服务异常' });
  }
});

// 阿里云上传接口
app.post('/api/upload', async (req, res) => {
  if (!req.files?.file) {
    return res.status(400).json({ error: '请选择要上传的文件' });
  }

  try {
    const client = new OSS({
      region: OSS_REGION,
      accessKeyId: OSS_ACCESS_KEY_ID,
      accessKeySecret: OSS_ACCESS_KEY_SECRET,
      bucket: OSS_BUCKET,
      secure: true
    });

    const file = req.files.file;
    const safeFileName = encodeURIComponent(file.name).replace(/%/g, '_');
    
    const result = await client.put(safeFileName, file.data, {
      headers: { 'Content-Type': file.mimetype }
    });

    res.json({ 
      url: result.url,
      name: file.name,
      size: file.size
    });
  } catch (error) {
    console.error('OSS上传失败:', error);
    res.status(500).json({ error: '文件上传失败' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`服务运行中，端口：${PORT}`));