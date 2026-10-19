import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 应用入口：挂载 <App/> 并引入全局样式
const rootElement = document.getElementById('root');

if (!rootElement) {
  // 理论上不会发生；防御性兜底，避免白屏无提示
  throw new Error('未找到根节点 #root，请检查 index.html 是否包含 <div id="root"></div>');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
