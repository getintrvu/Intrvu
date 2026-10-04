import { useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import LinkedInJobExtractor from './components/LinkedInJobExtractor';
import SignInScreen from './auth/SignInScreen';
import { useAuth } from './auth/AuthProvider';
import type { AnalysisData } from './types/AnalysisData';

export type SectionType =
  | 'start'
  | 'keywords'
  | 'experience'
  | 'education'
  | 'skills'
  | 'structure'
  | 'action-verbs'
  | 'measurable-results'
  | 'bullet-effectiveness'
  | 'results';

function App() {
  const { status } = useAuth();
  const [currentSection, setCurrentSection] = useState<SectionType>('start');
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [showFeedbackMenu, setShowFeedbackMenu] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  if (status === 'loading') {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading…</div>;
  }
  if (status === 'signedOut') return <SignInScreen />;

  return (
    <div className="flex h-full w-full overflow-hidden bg-white">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <div className="px-4 pb-1 pt-3">
          <LinkedInJobExtractor />
        </div>
        <MainContent
          currentSection={currentSection}
          onSectionChange={setCurrentSection}
          analysisData={analysisData}
          setAnalysisData={setAnalysisData}
          setAnalysisStarted={setAnalysisStarted}
        />
      </div>
      <Sidebar
        activeSection={currentSection}
        onSectionChange={setCurrentSection}
        analysisStarted={analysisStarted}
        showUserDropdown={showUserDropdown}
        setShowUserDropdown={setShowUserDropdown}
        showFeedbackMenu={showFeedbackMenu}
        setShowFeedbackMenu={setShowFeedbackMenu}
      />
    </div>
  );
}

export default App;
