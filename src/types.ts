export interface EchoItem {
  type: string;
  title: string;
  creator: string;
  year: string;
  content: string;
}

export interface EchoData {
  thematic_key: string;
  color_hex: string;
  echoes: EchoItem[];
  community_insight: string;
  search_query: string;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  speedY: number;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  input: string;
  data: EchoData;
}