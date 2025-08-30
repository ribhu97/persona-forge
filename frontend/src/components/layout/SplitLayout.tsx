import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface SplitLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  defaultRatio?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
  className?: string;
}

export function SplitLayout({
  leftPanel,
  rightPanel,
  defaultRatio = 0.4,
  minLeftWidth = 300,
  minRightWidth = 400,
  className
}: SplitLayoutProps) {
  const [ratio, setRatio] = useState(() => {
    const saved = localStorage.getItem('split-layout-ratio');
    return saved ? parseFloat(saved) : defaultRatio;
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('split-layout-ratio', ratio.toString());
  }, [ratio]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newRatio = (e.clientX - containerRect.left) / containerRect.width;
      
      const leftWidth = containerRect.width * newRatio;
      const rightWidth = containerRect.width * (1 - newRatio);
      
      if (leftWidth >= minLeftWidth && rightWidth >= minRightWidth) {
        setRatio(Math.max(0.2, Math.min(0.8, newRatio)));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, minLeftWidth, minRightWidth]);

  return (
    <div 
      ref={containerRef}
      className={cn("flex h-full w-full", className)}
    >
      {/* Left Panel */}
      <div 
        className="flex-shrink-0 overflow-hidden transition-all duration-300 ease-out"
        style={{ width: `${ratio * 100}%` }}
      >
        {leftPanel}
      </div>

      {/* Resize Handle */}
      <div
        className={cn(
          "w-1 bg-border hover:bg-primary/50 cursor-col-resize flex-shrink-0 transition-all duration-200 ease-out relative group",
          isResizing && "bg-primary"
        )}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/10 transition-all duration-200 ease-out" />
      </div>

      {/* Right Panel */}
      <div className="flex-1 min-w-0 transition-all duration-300 ease-out" style={{ height: '100vh', maxHeight: '100vh' }}>
        <div 
          className="persona-pane-scroll-fix"
          style={{ 
            height: '100%', 
            maxHeight: '100vh', 
            overflowY: 'auto', 
            overflowX: 'hidden',
            minHeight: '0',
            flex: '1 1 auto'
          }}
        >
          {rightPanel}
        </div>
      </div>
    </div>
  );
}

// Mobile/Tablet version with tabs
interface TabLayoutProps {
  tabs: Array<{
    id: string;
    label: string;
    content: React.ReactNode;
    badge?: number;
  }>;
  defaultTab?: string;
  className?: string;
}

export function TabLayout({ tabs, defaultTab, className }: TabLayoutProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  const activeTabContent = tabs.find(tab => tab.id === activeTab)?.content;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Tab Navigation */}
      <div className="flex border-b bg-background">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 ease-out relative",
              "hover:text-primary hover:bg-accent/50",
              activeTab === tab.id
                ? "text-primary border-b-2 border-primary bg-accent/30"
                : "text-muted-foreground"
            )}
          >
            <span className="flex items-center justify-center gap-2">
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5 min-w-[20px] h-5 flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        <div className="persona-pane-scroll animate-in fade-in duration-200 ease-out">
          {activeTabContent}
        </div>
      </div>
    </div>
  );
}

// Responsive wrapper that chooses between split and tab layout
interface ResponsiveLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  rightPanelLabel?: string;
  rightPanelBadge?: number;
  breakpoint?: 'md' | 'lg' | 'xl';
}

export function ResponsiveLayout({
  leftPanel,
  rightPanel,
  rightPanelLabel = "Results",
  rightPanelBadge,
  breakpoint = 'lg'
}: ResponsiveLayoutProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const bp = breakpoint === 'md' ? 768 : breakpoint === 'lg' ? 1024 : 1280;
      setIsMobile(window.innerWidth < bp);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  if (isMobile) {
    return (
      <div className="animate-in fade-in duration-300 ease-out">
        <TabLayout
          tabs={[
            { id: 'search', label: 'Search', content: leftPanel },
            { 
              id: 'results', 
              label: rightPanelLabel, 
              content: rightPanel, 
              badge: rightPanelBadge 
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 ease-out">
      <SplitLayout
        leftPanel={leftPanel}
        rightPanel={rightPanel}
      />
    </div>
  );
}