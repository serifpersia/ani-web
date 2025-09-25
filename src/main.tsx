
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { SidebarProvider } from './contexts/SidebarProvider';
import { TitlePreferenceProvider } from './contexts/TitlePreferenceContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <TitlePreferenceProvider>
            <App />
          </TitlePreferenceProvider>
        </SidebarProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
