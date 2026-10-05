import React from 'react';
import { SectionType } from '../App';
import { AnalysisData } from '../types/AnalysisData';
import StartSection from './sections/StartSection';
import ResultsView from './sections/ResultsView';
import KeywordsSection from './sections/KeywordsSection';
import ExperienceSection from './sections/ExperienceSection';
import EducationSection from './sections/EducationSection';
import SkillsSection from './sections/SkillsSection';
import StructureSection from './sections/StructureSection';
import ActionVerbsSection from './sections/ActionVerbsSection';
import MeasurableResultsSection from './sections/MeasurableResultsSection';
import BulletEffectivenessSection from './sections/BulletEffectivenessSection';
import { clearResume } from '../lib/resumeStore';

interface MainContentProps {
  currentSection: SectionType;
  setAnalysisStarted: (started: boolean) => void;
  onSectionChange: (section: SectionType) => void;
  analysisData: AnalysisData | null;
  setAnalysisData: (data: AnalysisData | null) => void;
  onOpenSettings: () => void;
}

const MainContent: React.FC<MainContentProps> = ({
  currentSection,
  setAnalysisStarted,
  onSectionChange,
  analysisData,
  setAnalysisData,
  onOpenSettings
}) => {
  const renderSection = () => {
    switch (currentSection) {
      case 'start':
        return (
          <StartSection
            setAnalysisStarted={setAnalysisStarted}
            onSectionChange={onSectionChange}
            setAnalysisData={setAnalysisData}
            onOpenSettings={onOpenSettings}
          />
        );
      case 'keywords':
        return <KeywordsSection analysisData={analysisData} />;
      case 'experience':
        return <ExperienceSection analysisData={analysisData} />;
      case 'education':
        return <EducationSection analysisData={analysisData} />;
      case 'skills':
        return <SkillsSection analysisData={analysisData} />;
      case 'structure':
        return <StructureSection analysisData={analysisData} />;
      case 'action-verbs':
        return <ActionVerbsSection analysisData={analysisData} />;
      case 'measurable-results':
        return <MeasurableResultsSection analysisData={analysisData} />;
      case 'bullet-effectiveness':
        return <BulletEffectivenessSection analysisData={analysisData} />;
      case 'results':
        return (
          <ResultsView
            analysisData={analysisData}
            onViewDetails={() => onSectionChange('keywords')}
            onUploadNewResume={() => {
              setAnalysisData(null);
              setAnalysisStarted(false);
              void clearResume();
              onSectionChange('start');
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <main className="px-6 pt-1 pb-4 overflow-y-auto bg-white relative min-w-0 flex flex-col h-full">
      <div className="flex items-center justify-start">
        <div className="w-full">
          {renderSection()}
        </div>
      </div>

      {/* Version info */}
      <div className="text-center text-xs text-gray-400 mt-8">
        <div>IntrvuFit v{__APP_VERSION__}</div>
        <div>All rights reserved © {new Date().getFullYear()} intrvu.ca</div>
      </div>
    </main>
  );
};

export default MainContent;