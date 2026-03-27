export const GET_EVENT = /* GraphQL */ `
  query GetEvent($eventId: ID!) {
    getEvent(eventId: $eventId) {
      eventId
      title
      description
      participantCode
      createdAt
      isActive
    }
  }
`;

export const GET_EVENT_BY_CODE = /* GraphQL */ `
  query GetEventByCode($participantCode: String!) {
    getEventByCode(participantCode: $participantCode) {
      eventId
      title
      description
      participantCode
      createdAt
      isActive
    }
  }
`;

export const LIST_COMMENTS = /* GraphQL */ `
  query ListComments($eventId: ID!, $limit: Int, $nextToken: String) {
    listComments(eventId: $eventId, limit: $limit, nextToken: $nextToken) {
      items {
        commentId
        eventId
        content
        authorName
        createdAt
      }
      nextToken
    }
  }
`;
