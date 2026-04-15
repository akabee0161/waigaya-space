import { useState, useEffect, useCallback, useRef } from "react";
import { generateClient } from "aws-amplify/api";
import { LIST_COMMENTS } from "../graphql/queries";
import { POST_COMMENT, REACT_TO_COMMENT } from "../graphql/mutations";
import { ON_COMMENT_POSTED, ON_REACTION_UPDATED } from "../graphql/subscriptions";
import type { Comment, CommentConnection } from "../types";

const client = generateClient();

interface SubscriptionObservable<T> {
  subscribe(observer: {
    next: (value: { data?: T }) => void;
    error: (err: unknown) => void;
  }): { unsubscribe: () => void };
}

// AWSJSON は文字列で返ることがあるため安全にパース
function parseReactions(raw: unknown): Record<string, number> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw as Record<string, number>;
}

export function useComments(eventId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const commentSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const reactionSubRef = useRef<{ unsubscribe: () => void } | null>(null);

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      const allItems: Comment[] = [];
      let nextToken: string | null = null;
      const seenTokens = new Set<string>();
      const MAX_PAGES = 1000;
      let page = 0;
      do {
        if (page++ >= MAX_PAGES) {
          console.error("fetchComments: MAX_PAGES exceeded");
          break;
        }
        if (nextToken) {
          if (seenTokens.has(nextToken)) {
            console.error("fetchComments: repeated nextToken detected");
            break;
          }
          seenTokens.add(nextToken);
        }
        const result = await client.graphql({
          query: LIST_COMMENTS,
          variables: { eventId, limit: 100, nextToken },
        });
        const data: CommentConnection = (
          result as { data: { listComments: CommentConnection } }
        ).data.listComments;
        allItems.push(
          ...data.items.map((c: Comment) => ({ ...c, reactions: parseReactions(c.reactions) }))
        );
        nextToken = data.nextToken ?? null;
      } while (nextToken);
      setComments(allItems);
    } catch (err) {
      setError("コメントの取得に失敗しました");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchComments();

    // 新規コメント Subscription
    const commentObs = client.graphql({
      query: ON_COMMENT_POSTED,
      variables: { eventId },
    }) as unknown as SubscriptionObservable<{ onCommentPosted?: Comment }>;

    commentSubRef.current = commentObs.subscribe({
      next: ({ data }) => {
        const newComment = data?.onCommentPosted;
        if (newComment) {
          setComments((prev) => {
            if (prev.some((c) => c.commentId === newComment.commentId)) return prev;
            return [...prev, { ...newComment, reactions: {} }].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt)
            );
          });
        }
      },
      error: (err: unknown) => {
        console.error("Comment subscription error:", err);
        setError("リアルタイム接続が切断されました");
      },
    });

    // リアクション更新 Subscription
    const reactionObs = client.graphql({
      query: ON_REACTION_UPDATED,
      variables: { eventId },
    }) as unknown as SubscriptionObservable<{ onReactionUpdated?: Comment }>;

    reactionSubRef.current = reactionObs.subscribe({
      next: ({ data }) => {
        const updated = data?.onReactionUpdated;
        if (updated) {
          setComments((prev) =>
            prev.map((c) =>
              c.commentId === updated.commentId
                ? { ...c, reactions: parseReactions(updated.reactions) }
                : c
            )
          );
        }
      },
      error: (err: unknown) => {
        console.error("Reaction subscription error:", err);
      },
    });

    return () => {
      commentSubRef.current?.unsubscribe();
      reactionSubRef.current?.unsubscribe();
    };
  }, [eventId, fetchComments]);

  const postComment = useCallback(
    async (content: string, authorName: string) => {
      const result = await client.graphql({
        query: POST_COMMENT,
        variables: { input: { eventId, content, authorName } },
      });
      return (result as { data: { postComment: Comment } }).data.postComment;
    },
    [eventId]
  );

  const reactToComment = useCallback(
    async (commentCreatedAt: string, emoji: string, action: "add" | "remove") => {
      await client.graphql({
        query: REACT_TO_COMMENT,
        variables: { eventId, commentCreatedAt, emoji, action },
      });
    },
    [eventId]
  );

  return { comments, loading, error, postComment, reactToComment, refetch: fetchComments };
}
