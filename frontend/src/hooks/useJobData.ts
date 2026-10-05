import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../extension/constants';
import { getItem, onItemChanged } from '../lib/storage';
import type { JobData } from '../types/JobData';

/** The job posting currently extracted from the LinkedIn page (kept up to date by the content script). */
export function useJobData(): JobData | undefined {
  const [job, setJob] = useState<JobData | undefined>();

  useEffect(() => {
    let active = true;
    getItem<JobData>(STORAGE_KEYS.jobData).then((stored) => active && setJob(stored));
    const unsubscribe = onItemChanged<JobData>(STORAGE_KEYS.jobData, setJob);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return job;
}
