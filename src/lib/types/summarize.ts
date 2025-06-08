export interface SummarizeRequest {
  textToSummarize: string;
  targetLength?: 'short' | 'medium' | 'long';
}

export interface SummarizeResponse {
  summary: string;
}
