import { useState } from 'react';
import { useAnalysisSession } from './hooks/useAnalysisSession';
import { useJobData } from './hooks/useJobData';
import { jobKey } from './lib/jobKey';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import LinkedInJobExtractor from './components/LinkedInJobExtractor';
import SettingsPanel from './components/SettingsPanel';
import SignInScreen from './auth/SignInScreen';
import { useAuth } from './auth/AuthProvider';

export type { SectionType } from './hooks/useAnalysisSession';

function App() {
  const { status } = useAuth();
  const job = useJobData();
  const { section, setSection, analysisData, analysisStarted, showResult, clearResult } = useAnalysisSession(
    job?.jobDescription ? jobKey(job.jobDescription) : null,
  );
  const [showFeedbackMenu, setShowFeedbackMenu] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  if (status === 'loading') {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading…</div>;
  }
  if (status === 'signedOut') return <SignInScreen />;

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-white">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <div className="px-4 pb-1 pt-3">
          <LinkedInJobExtractor />
        </div>
        <MainContent
          currentSection={section}
          onSectionChange={setSection}
          analysisData={analysisData}
          onResult={showResult}
          onClearResult={clearResult}
          onOpenSettings={() => setShowSettings(true)}
        />
      </div>
      <Sidebar
        activeSection={section}
        onSectionChange={setSection}
        analysisStarted={analysisStarted}
        showUserDropdown={showUserDropdown}
        setShowUserDropdown={setShowUserDropdown}
        showFeedbackMenu={showFeedbackMenu}
        setShowFeedbackMenu={setShowFeedbackMenu}
        onOpenSettings={() => {
          setShowUserDropdown(false);
          setShowSettings(true);
        }}
      />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
