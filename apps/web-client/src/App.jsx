import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { CashflowPage } from './pages/CashflowPage';
import { InvoicePage } from './pages/InvoicePage';
import { TaxCheckerPage } from './pages/TaxCheckerPage';

export function App() {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] flex text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Fixed Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto h-screen">
        <Navbar
          activeTab={activeTab}
          onRefresh={handleRefresh}
        />

        <main className="flex-1 p-6 sm:p-8">
          {activeTab === 'dashboard' && <DashboardPage key={refreshKey} setActiveTab={setActiveTab} />}
          {activeTab === 'cashflow' && <CashflowPage key={refreshKey} />}
          {activeTab === 'invoices' && <InvoicePage key={refreshKey} />}
          {activeTab === 'tax-check' && <TaxCheckerPage key={refreshKey} />}
        </main>
      </div>
    </div>
  );
}

export default App;
