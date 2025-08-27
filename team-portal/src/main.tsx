// src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { StrictMode } from 'react';

import App from './App.tsx';
import './index.css';

// Gunakan '!' untuk memberitahu TypeScript bahwa elemen 'root' akan selalu ada
ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode digunakan untuk membantu mendeteksi potensi masalah pada aplikasi
  <StrictMode>
    {/* BrowserRouter membungkus seluruh aplikasi untuk mengaktifkan routing */}
    <BrowserRouter>
      {/* Komponen utama aplikasi */}
      <App />
    </BrowserRouter>
  </StrictMode>
);
