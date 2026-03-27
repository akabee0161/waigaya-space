export const ON_COMMENT_POSTED = /* GraphQL */ `
  subscription OnCommentPosted($eventId: ID!) {
    onCommentPosted(eventId: $eventId) {
      commentId
      eventId
      content
      authorName
      createdAt
    }
  }
`;
