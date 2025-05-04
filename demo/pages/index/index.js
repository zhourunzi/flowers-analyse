// pages/index/index.js
const config = require('../../utils/config.js');
const CryptoJS = require('crypto-js');  // 引入加密库
let cachedToken = '';

Page({
  data: {
    previewImage: null,
    selectedFile: null,
    result: null
  },
  handleUpload() {
    wx.chooseImage({
      count: 1,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePaths = res.tempFilePaths;
        this.setData({
          previewImage: tempFilePaths[0],
          selectedFile: tempFilePaths[0]
        });
      }
    });
  },
  getBase64(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: filePath,
        encoding: 'base64',
        success: res => {
          resolve(res.data);
        },
        fail: err => {
          reject(err);
        }
      });
    });
  },
  async refreshToken() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://aip.baidubce.com/oauth/2.0/token',
          method: 'POST',
          header: {
            'Content-Type': 'application/x-www-form-urlencoded' // 增加请求头
          },
          data: {
            grant_type: 'client_credentials',
            client_id: config.BAIDU_API_KEY,
            client_secret: config.BAIDU_SECRET_KEY
          },
          success: res => {
            if (res.data.error) { // 增加错误处理
              reject(new Error(`百度API错误: ${res.data.error_description}`))
              return
            }
            resolve(res.data);
          },
          fail: err => {
            reject(err);
          }
        });
      });
      cachedToken = res.access_token;
    } catch (error) {
      console.error('获取百度Token失败:', error);
    }
  },
  async analyzeImage() {
    if (!this.data.selectedFile) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      });
      return;
    }
    try {
      if (!cachedToken) await this.refreshToken();
      const base64Data = await this.getBase64(this.data.selectedFile);
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `https://aip.baidubce.com/rest/2.0/image-classify/v1/plant?access_token=${cachedToken}`,
          method: 'POST',
          header: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          data: `image=${encodeURIComponent(base64Data)}`,
          success: res => {
            resolve(res.data);
          },
          fail: err => {
            reject(err);
          }
        });
      });
      if (res.result && res.result.length > 0) {
        // 格式化 score 为保留两位小数的百分比
        res.result.forEach(item => {
          item.formattedScore = (item.score * 100).toFixed(2) + '%';
        });
      }
      this.setData({
        result: res
      });
    } catch (error) {
      console.error('识别失败:', error);
      wx.showToast({
        title: '识别失败：' + error.errMsg,
        icon: 'none'
      });
    }
  },
  async uploadToAliyun() {
    if (!this.data.selectedFile) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      });
      return;
    }
    try {
      // 阿里云配置
      const accessKeyId = config.ALIYUN_ACCESS_KEY_ID;
      const accessKeySecret = config.ALIYUN_ACCESS_KEY_SECRET;
      const bucket = config.BUCKET;
      const region = config.REGION;
      const host = `${bucket}.${region}.aliyuncs.com`;

      // 生成策略
      const expiration = new Date(Date.now() + 3600 * 1000).toISOString();
      const policy = {
        expiration: expiration,
        conditions: [
          ["content-length-range", 0, 104857600], // 文件大小限制100MB
          ["starts-with", "$key", ""] // 允许任意文件名
        ]
      };

      // 生成签名
      const policyBase64 = CryptoJS.enc.Utf8.parse(JSON.stringify(policy)).toString(CryptoJS.enc.Base64);
      const signature = CryptoJS.HmacSHA1(policyBase64, accessKeySecret).toString(CryptoJS.enc.Base64);

      // 生成唯一文件名
      const fileName = this.data.selectedFile.split('/').pop();
      const safeFileName = encodeURIComponent(fileName).replace(/%/g, '_');

      // 执行上传
      wx.uploadFile({
        url: `https://${host}`,
        filePath: this.data.selectedFile,
        name: 'file',
        formData: {
          key: safeFileName,
          policy: policyBase64,
          OSSAccessKeyId: accessKeyId,
          signature: signature,
          'x-oss-object-acl': 'private',
          success_action_status: '200'
        },
        success: (res) => {
          if (res.statusCode === 200) {
            wx.showToast({ title: '上传阿里云成功', icon: 'success' });
          } else {
            wx.showToast({ title: `上传失败：${res.statusCode}`, icon: 'none' });
          }
        },
        fail: (err) => {
          console.error('上传失败:', err);
          wx.showToast({ title: '上传失败：' + err.errMsg, icon: 'none' });
        }
      });
    } catch (error) {
      console.error('上传异常:', error);
      wx.showToast({ title: '上传异常：' + error.message, icon: 'none' });
    }
  }
});    