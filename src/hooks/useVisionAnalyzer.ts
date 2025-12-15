import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type VisionAction = 'analyze_screenshot' | 'analyze_layout' | 'analyze_competitor' | 'extract_text' | 'analyze_brand';

interface VisionResponse {
  success: boolean;
  action: VisionAction;
  analysis: string;
  model: string;
  tokens_used: number;
}

export const useVisionAnalyzer = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<string | null>(null);

  const analyzeImage = useCallback(async (
    action: VisionAction,
    imageSource: { url?: string; base64?: string },
    options?: { question?: string; context?: string }
  ): Promise<VisionResponse | null> => {
    if (!imageSource.url && !imageSource.base64) {
      toast.error('Image source required');
      return null;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('vision-analyzer', {
        body: {
          action,
          image_url: imageSource.url,
          image_base64: imageSource.base64,
          question: options?.question,
          context: options?.context,
        },
      });

      if (error) {
        console.error('Vision analysis error:', error);
        toast.error('Failed to analyze image');
        return null;
      }

      if (data.error) {
        if (data.error.includes('Rate limit')) {
          toast.error('Rate limit exceeded. Please try again later.');
        } else if (data.error.includes('credits')) {
          toast.error('AI credits exhausted. Please add credits.');
        } else {
          toast.error(data.error);
        }
        return null;
      }

      setLastAnalysis(data.analysis);
      return data as VisionResponse;
    } catch (err) {
      console.error('Vision analyzer hook error:', err);
      toast.error('Vision analysis failed');
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Convenience methods
  const analyzeScreenshot = useCallback((
    imageSource: { url?: string; base64?: string },
    question?: string
  ) => analyzeImage('analyze_screenshot', imageSource, { question }), [analyzeImage]);

  const analyzeLayout = useCallback((
    imageSource: { url?: string; base64?: string },
    question?: string
  ) => analyzeImage('analyze_layout', imageSource, { question }), [analyzeImage]);

  const analyzeCompetitor = useCallback((
    imageSource: { url?: string; base64?: string },
    question?: string
  ) => analyzeImage('analyze_competitor', imageSource, { question }), [analyzeImage]);

  const extractText = useCallback((
    imageSource: { url?: string; base64?: string }
  ) => analyzeImage('extract_text', imageSource), [analyzeImage]);

  const analyzeBrand = useCallback((
    imageSource: { url?: string; base64?: string },
    question?: string
  ) => analyzeImage('analyze_brand', imageSource, { question }), [analyzeImage]);

  return {
    isAnalyzing,
    lastAnalysis,
    analyzeImage,
    analyzeScreenshot,
    analyzeLayout,
    analyzeCompetitor,
    extractText,
    analyzeBrand,
  };
};
