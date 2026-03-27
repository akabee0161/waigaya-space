export interface Event {
  eventId: string;
  title: string;
  description?: string | null;
  participantCode: string;
  createdAt: string;
  isActive: boolean;
}

export interface Comment {
  commentId: string;
  eventId: string;
  content: string;
  authorName: string;
  createdAt: string;
}

export interface CommentConnection {
  items: Comment[];
  nextToken?: string | null;
}
