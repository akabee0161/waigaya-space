import { useState, useEffect, useCallback, useRef } from "react";
import { generateClient } from "aws-amplify/api";
import { LIST_COMMENTS } from "../graphql/queries";
import { POST_COMMENT } from "../graphql/mutations";
import { ON_COMMENT_POSTED } from "../graphql/subscriptions";
import type { Comment, CommentConnection } from "../types";

const client = generateClient();

interface SubscriptionObservable {
  subscribe(observer: {
    next: (value: { data?: { onCommentPosted?: Comment } }) => void;
    error: (err: unknown) => void;
  }): { unsubscribe: () => void };
}

export function useComments(eventId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  // 過去コメントをフェッチ
  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      const result = await client.graphql({
        query: LIST_COMMENTS,
        variables: { eventId, limit: 100 },
      });
      const data = (result as { data: { listComments: CommentConnection } })
        .data.listComments;
      setComments(data.items);
    } catch (err) {
      setError("コメントの取得に失敗しました");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // リアルタイムSubscription
  useEffect(() => {
    fetchComments();

    const observable = client.graphql({
      query: ON_COMMENT_POSTED,
      variables: { eventId },
    }) as unknown as SubscriptionObservable;

    const sub = observable.subscribe({
      next: ({ data }) => {
        const newComment = data?.onCommentPosted;
        if (newComment) {
          setComments((prev) => {
            // 重複チェック
            if (prev.some((c) => c.commentId === newComment.commentId)) {
              return prev;
            }
            return [...prev, newComment].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt)
            );
          });
        }
      },
      error: (err: unknown) => {
        console.error("Subscription error:", err);
        setError("リアルタイム接続が切断されました");
      },
    });

    subscriptionRef.current = sub;

    return () => {
      subscriptionRef.current?.unsubscribe();
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

  return { comments, loading, error, postComment, refetch: fetchComments };
}
