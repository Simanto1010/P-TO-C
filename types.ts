
export type ItemType = 'text' | 'image' | 'video' | 'link' | 'file' | 'contact' | 'address';

export interface SmartAction {
  label: string;
  icon: string;
  url?: string;
}

export interface TransferItem {
  id: string;
  type: ItemType;
  content: string; 
  fileName?: string;
  timestamp: number;
  aiInsight?: string;
  smartActions?: SmartAction[];
  metadata?: {
    size?: number;
    mimeType?: string;
    dimensions?: string;
  };
}

export interface ConnectionStatus {
  isLive: boolean;
  latency: number;
  bridgeId: string;
  peerType: 'mobile' | 'desktop' | 'unknown';
}
