export const CREATE_EVENT = /* GraphQL */ `
  mutation CreateEvent($input: CreateEventInput!) {
    createEvent(input: $input) {
      eventId
      title
      description
      participantCode
      createdAt
      isActive
    }
  }
`;

export const POST_COMMENT = /* GraphQL */ `
  mutation PostComment($input: PostCommentInput!) {
    postComment(input: $input) {
      commentId
      eventId
      content
      authorName
      createdAt
    }
  }
`;

export const CLOSE_EVENT = /* GraphQL */ `
  mutation CloseEvent($eventId: ID!) {
    closeEvent(eventId: $eventId) {
      eventId
      isActive
    }
  }
`;
