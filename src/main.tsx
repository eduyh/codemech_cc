import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BattlefieldApp } from './components/BattlefieldApp';
import './index.css';

const appParam = new URLSearchParams(window.location.search).get('app');
const isBattlefieldEntry =
  appParam === 'battlefield' ||
  (appParam !== 'studio' &&
    (document.documentElement.dataset.appMode === 'battlefield' ||
      window.location.pathname.endsWith('battlefield.html')));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isBattlefieldEntry ? <BattlefieldApp /> : <App />}
  </React.StrictMode>
);
