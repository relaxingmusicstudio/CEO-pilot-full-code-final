import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Building2, 
  Info, 
  Wrench, 
  Users, 
  Star, 
  Target, 
  Sparkles, 
  Send,
  Bot,
  User,
  Rocket,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggested_actions?: string[];
  timestamp: Date;
}

interface ExtractedData {
  industry?: string;
  template_key?: string;
  business_name?: string;
  location?: string;
  service_area?: string;
  team_size?: number;
  years_in_business?: number;
  services?: string[];
  avg_job_value?: number;
  emergency_services?: boolean;
  target_customers?: string;
  customer_pain_points?: string[];
  competitors?: string[];
  unique_selling_points?: string[];
  brand_personality?: string[];
  main_goals?: string[];
  business_dna?: Record<string, unknown>;
  business_profile?: Record<string, unknown>;
  ai_system_prompt?: string;
}

interface DiscoveryResponse {
  text: string;
  suggested_actions?: string[];
  current_stage: string;
  extracted_data?: ExtractedData;
  configuration_complete?: boolean;
  error?: string;
}

const DISCOVERY_STAGES = [
  { id: 'industry', label: 'Industry', icon: Building2 },
  { id: 'identity', label: 'Business Info', icon: Info },
  { id: 'services', label: 'Services', icon: Wrench },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'differentiation', label: 'Unique Value', icon: Star },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'configuration', label: 'Configure', icon: Sparkles },
];

interface BusinessDiscoveryWizardProps {
  tenantId?: string;
  onComplete?: (data: ExtractedData) => void;
  onClose?: () => void;
}

export function BusinessDiscoveryWizard({ 
  tenantId, 
  onComplete,
  onClose 
}: BusinessDiscoveryWizardProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState('industry');
  const [extractedData, setExtractedData] = useState<ExtractedData>({});
  const [isConfigurationComplete, setIsConfigurationComplete] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Calculate progress
  const stageIndex = DISCOVERY_STAGES.findIndex(s => s.id === currentStage);
  const progress = ((stageIndex + 1) / DISCOVERY_STAGES.length) * 100;

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const initializeConversation = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('business-discovery', {
        body: { 
          messages: [{ role: 'user', content: 'Start the business discovery process' }],
          currentData: {}
        }
      });

      if (error) throw error;

      const response = data as DiscoveryResponse;
      setMessages([{
        role: 'assistant',
        content: response.text,
        suggested_actions: response.suggested_actions,
        timestamp: new Date()
      }]);
      setCurrentStage(response.current_stage || 'industry');
    } catch (error) {
      console.error('Init error:', error);
      // Fallback initial message
      setMessages([{
        role: 'assistant',
        content: "Welcome! I'm your AI business consultant. I'll help you set up your business in about 5 minutes. Let's start - what industry are you in?",
        suggested_actions: ['HVAC', 'Plumbing', 'Solar', 'Roofing', 'Electrical', 'Other'],
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const hasMessages = messages.length > 0;

  // Initialize conversation
  useEffect(() => {
    if (!hasMessages) {
      initializeConversation();
    }
  }, [hasMessages, initializeConversation]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Build message history for context
      const messageHistory = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content
      }));

      const { data, error } = await supabase.functions.invoke('business-discovery', {
        body: { 
          messages: messageHistory,
          currentData: extractedData
        }
      });

      if (error) throw error;

      const response = data as DiscoveryResponse;

      // Update extracted data
      if (response.extracted_data) {
        setExtractedData(prev => ({ ...prev, ...response.extracted_data }));
      }

      // Update stage
      if (response.current_stage) {
        setCurrentStage(response.current_stage);
      }

      // Check if complete
      if (response.configuration_complete) {
        setIsConfigurationComplete(true);
      }

      // Add assistant message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.text,
        suggested_actions: response.suggested_actions,
        timestamp: new Date()
      }]);

    } catch (error) {
      console.error('Message error:', error);
      toast.error('Failed to process message. Please try again.');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I apologize, I had a brief issue. Could you repeat that?",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, extractedData, isLoading]);

  const handleOptionClick = (option: string) => {
    sendMessage(option);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const provisionBusiness = async () => {
    setIsProvisioning(true);
    try {
      const { data, error } = await supabase.functions.invoke('provision-new-business', {
        body: {
          tenant_id: tenantId,
          template_key: extractedData.template_key || extractedData.industry?.toLowerCase() || 'hvac',
          business_dna: extractedData.business_dna || {
            business_name: extractedData.business_name,
            industry: extractedData.industry,
            target_customer: {
              type: extractedData.target_customers,
              pain_points: extractedData.customer_pain_points
            },
            brand_voice: {
              personality: extractedData.brand_personality
            },
            unique_value_proposition: extractedData.unique_selling_points?.join('. '),
            competitors: extractedData.competitors,
            avg_job_value: extractedData.avg_job_value
          },
          business_profile: extractedData.business_profile || {
            business_name: extractedData.business_name,
            services: extractedData.services,
            service_area: extractedData.service_area,
            avg_job_value: extractedData.avg_job_value
          },
          ai_system_prompt: extractedData.ai_system_prompt,
          seed_demo_data: true
        }
      });

      if (error) throw error;

      toast.success('Business configured successfully!');
      onComplete?.(extractedData);

    } catch (error) {
      console.error('Provisioning error:', error);
      toast.error('Failed to provision business. Please try again.');
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto h-[700px] flex flex-col bg-background border-border">
      {/* Header with Progress */}
      <CardHeader className="pb-2 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Business Discovery
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {Math.round(progress)}% Complete
          </Badge>
        </div>
        
        {/* Stage Progress */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between">
            {DISCOVERY_STAGES.map((stage, index) => {
              const Icon = stage.icon;
              const isActive = stage.id === currentStage;
              const isCompleted = index < stageIndex;
              
              return (
                <div 
                  key={stage.id}
                  className={`flex flex-col items-center gap-1 ${
                    isActive ? 'text-primary' : isCompleted ? 'text-muted-foreground' : 'text-muted-foreground/50'
                  }`}
                >
                  <div className={`p-1.5 rounded-full ${
                    isActive ? 'bg-primary/20' : isCompleted ? 'bg-muted' : 'bg-muted/50'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                  </div>
                  <span className="text-[10px] hidden sm:block">{stage.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardHeader>

      {/* Chat Messages */}
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                
                <div className={`max-w-[80%] space-y-2 ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`rounded-2xl px-4 py-2.5 ${
                    message.role === 'user' 
                      ? 'bg-primary text-primary-foreground rounded-br-sm' 
                      : 'bg-muted rounded-bl-sm'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  
                  {/* Suggested Actions */}
                  {message.role === 'assistant' && message.suggested_actions && message.suggested_actions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {message.suggested_actions.map((action, actionIndex) => (
                        <Button
                          key={actionIndex}
                          variant="outline"
                          size="sm"
                          className="text-xs h-8"
                          onClick={() => handleOptionClick(action)}
                          disabled={isLoading}
                        >
                          {action}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Configuration Complete Card */}
            {isConfigurationComplete && (
              <Card className="bg-primary/5 border-primary/20 mt-4">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-full bg-primary/20">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Configuration Complete!</h4>
                      <p className="text-sm text-muted-foreground">
                        Your business is ready to be provisioned
                      </p>
                    </div>
                  </div>
                  
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                    {extractedData.business_name && (
                      <div>
                        <span className="text-muted-foreground">Business:</span>{' '}
                        <span className="font-medium">{extractedData.business_name}</span>
                      </div>
                    )}
                    {extractedData.industry && (
                      <div>
                        <span className="text-muted-foreground">Industry:</span>{' '}
                        <span className="font-medium">{extractedData.industry}</span>
                      </div>
                    )}
                    {extractedData.services && extractedData.services.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Services:</span>{' '}
                        <span className="font-medium">{extractedData.services.slice(0, 3).join(', ')}</span>
                      </div>
                    )}
                  </div>

                  <Button 
                    className="w-full" 
                    onClick={provisionBusiness}
                    disabled={isProvisioning}
                  >
                    {isProvisioning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Setting Up...
                      </>
                    ) : (
                      <>
                        <Rocket className="mr-2 h-4 w-4" />
                        Launch My Business
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Input Area */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your response..."
            disabled={isLoading || isConfigurationComplete}
            className="flex-1"
          />
          <Button 
            onClick={() => sendMessage(inputValue)}
            disabled={!inputValue.trim() || isLoading || isConfigurationComplete}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
