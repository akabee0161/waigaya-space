export const ON_REACTION_UPDATED = /* GraphQL */ `
  subscription OnReactionUpdated($eventId: ID!) {
    onReactionUpdated(eventId: $eventId) {
      commentId
      eventId
      reactions
    }
  }
`;

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
