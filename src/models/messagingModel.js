import sql from "../config/db.js";
import { asInt, asText } from "../utils/sqlValue.js";

export const findDirectConversation = (directKey) => {
  const request = new sql.Request();
  request.input("DirectKey", sql.NVarChar, asText(directKey));
  return {
    request,
    run: () =>
      request.query(`
        SELECT Id, Kind, BranchCode, DirectKey, CreatedByUserCode, CreatedAt
        FROM banc.conversations
        WHERE Kind = 'DIRECT' AND DirectKey = @DirectKey
      `),
  };
};

// One transaction, because a conversation with no participants is unreachable
// by everyone including the person who just created it -- the list reads
// through conversation_participants.
export const createDirectConversation = (directKey, createdBy, otherUserCode) => {
  const transaction = new sql.Transaction();

  return {
    run: async () => {
      await transaction.begin();

      try {
        const insert = new sql.Request(transaction);
        insert.input("DirectKey", sql.NVarChar, asText(directKey));
        insert.input("CreatedBy", sql.NVarChar, asText(createdBy));

        const created = await insert.query(`
          INSERT INTO banc.conversations (Kind, DirectKey, CreatedByUserCode)
          OUTPUT INSERTED.Id, INSERTED.Kind, INSERTED.DirectKey,
                 INSERTED.CreatedByUserCode, INSERTED.CreatedAt
          VALUES ('DIRECT', @DirectKey, @CreatedBy)
        `);

        const conversation = created.recordset[0];

        const participants = new sql.Request(transaction);
        participants.input("ConversationId", sql.BigInt, conversation.Id);
        participants.input("One", sql.NVarChar, asText(createdBy));
        participants.input("Two", sql.NVarChar, asText(otherUserCode));

        await participants.query(`
          INSERT INTO banc.conversation_participants (ConversationId, UserCode)
          VALUES (@ConversationId, @One), (@ConversationId, @Two)
        `);

        await transaction.commit();

        return { recordset: [conversation] };
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },
  };
};

// The caller's conversations, newest activity first, with the other person's
// name resolved and the unread count computed across the whole conversation
// rather than a page of it.
export const listForUser = (userCode, options) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, asText(userCode));
  request.input("PageNumber", sql.Int, asInt(options.PageNumber) ?? 1);
  request.input("PageSize", sql.Int, asInt(options.PageSize) ?? 20);

  return {
    request,
    run: () =>
      request.query(`
        SELECT
            c.Id,
            c.Kind,
            c.BranchCode,
            other.UserCode  AS OtherUserCode,
            COALESCE(ou.FullName, ou.FirstName + ' ' + ou.LastName) AS OtherFullName,
            ou.Role         AS OtherRole,
            last.Body       AS LastBody,
            last.CreatedAt  AS LastAt,
            last.SenderUserCode AS LastSenderUserCode,
            (
                SELECT COUNT(*)
                FROM banc.messages m
                WHERE m.ConversationId = c.Id
                  AND m.DeletedAt IS NULL
                  AND m.SenderUserCode <> @UserCode
                  AND (me.LastReadAt IS NULL OR m.CreatedAt > me.LastReadAt)
            ) AS UnreadCount,
            COUNT(*) OVER() AS TotalCount
        FROM banc.conversation_participants me
        INNER JOIN banc.conversations c ON c.Id = me.ConversationId
        LEFT JOIN banc.conversation_participants other
               ON other.ConversationId = c.Id AND other.UserCode <> @UserCode
        LEFT JOIN banc.Users ou ON ou.UserCode = other.UserCode
        OUTER APPLY (
            SELECT TOP 1 m.Body, m.CreatedAt, m.SenderUserCode
            FROM banc.messages m
            WHERE m.ConversationId = c.Id AND m.DeletedAt IS NULL
            ORDER BY m.CreatedAt DESC, m.Id DESC
        ) last
        WHERE me.UserCode = @UserCode
        ORDER BY COALESCE(last.CreatedAt, c.CreatedAt) DESC, c.Id DESC
        OFFSET (@PageNumber - 1) * @PageSize ROWS
        FETCH NEXT @PageSize ROWS ONLY
      `),
  };
};

export const getParticipation = (conversationId, userCode) => {
  const request = new sql.Request();
  request.input("ConversationId", sql.BigInt, asInt(conversationId));
  request.input("UserCode", sql.NVarChar, asText(userCode));
  return {
    request,
    run: () =>
      request.query(`
        SELECT p.Id, p.ConversationId, p.UserCode, p.LastReadAt, p.LastDeliveredAt,
               c.Kind, c.BranchCode, c.DirectKey
        FROM banc.conversation_participants p
        INNER JOIN banc.conversations c ON c.Id = p.ConversationId
        WHERE p.ConversationId = @ConversationId AND p.UserCode = @UserCode
      `),
  };
};

export const insertMessage = (conversationId, senderUserCode, body) => {
  const request = new sql.Request();
  request.input("ConversationId", sql.BigInt, asInt(conversationId));
  request.input("SenderUserCode", sql.NVarChar, asText(senderUserCode));
  request.input("Body", sql.NVarChar, asText(body));
  return {
    request,
    run: () =>
      request.query(`
        INSERT INTO banc.messages (ConversationId, SenderUserCode, Body)
        OUTPUT INSERTED.Id, INSERTED.ConversationId, INSERTED.SenderUserCode,
               INSERTED.Body, INSERTED.CreatedAt
        VALUES (@ConversationId, @SenderUserCode, @Body)
      `),
  };
};

// Newest first, and the ORDER BY carries Id as well as CreatedAt. Two messages
// can share a DATETIME2, and a paged read with an unstable sort repeats or
// skips a row at the page boundary. IX_messages_Conversation_CreatedAt is
// ascending and SQL Server scans it backwards for this.
export const listMessages = (conversationId, options) => {
  const request = new sql.Request();
  request.input("ConversationId", sql.BigInt, asInt(conversationId));
  request.input("PageNumber", sql.Int, asInt(options.PageNumber) ?? 1);
  request.input("PageSize", sql.Int, asInt(options.PageSize) ?? 20);

  return {
    request,
    run: () =>
      request.query(`
        SELECT m.Id, m.SenderUserCode, m.Body, m.CreatedAt,
               COUNT(*) OVER() AS TotalCount
        FROM banc.messages m
        WHERE m.ConversationId = @ConversationId AND m.DeletedAt IS NULL
        ORDER BY m.CreatedAt DESC, m.Id DESC
        OFFSET (@PageNumber - 1) * @PageSize ROWS
        FETCH NEXT @PageSize ROWS ONLY
      `),
  };
};

// Seen always sets delivered too. A conversation opened without a live event
// behind it -- a fresh page load -- would otherwise read as seen but never
// delivered, which is impossible in reality and renders as a defect.
export const markRead = (conversationId, userCode) => {
  const request = new sql.Request();
  request.input("ConversationId", sql.BigInt, asInt(conversationId));
  request.input("UserCode", sql.NVarChar, asText(userCode));
  return {
    request,
    run: () =>
      request.query(`
        UPDATE banc.conversation_participants
        SET LastReadAt = SYSUTCDATETIME(),
            LastDeliveredAt = SYSUTCDATETIME()
        WHERE ConversationId = @ConversationId AND UserCode = @UserCode
      `),
  };
};

export const markDelivered = (conversationId, userCode) => {
  const request = new sql.Request();
  request.input("ConversationId", sql.BigInt, asInt(conversationId));
  request.input("UserCode", sql.NVarChar, asText(userCode));
  return {
    request,
    run: () =>
      request.query(`
        UPDATE banc.conversation_participants
        SET LastDeliveredAt = SYSUTCDATETIME()
        WHERE ConversationId = @ConversationId AND UserCode = @UserCode
      `),
  };
};

// One number for the message icon. Counted across every conversation the caller
// is in, never across a page -- a badge derived from returned rows caps at the
// page size and looks right until somebody has more than twenty unread.
export const unreadCount = (userCode) => {
  const request = new sql.Request();
  request.input("UserCode", sql.NVarChar, asText(userCode));
  return {
    request,
    run: () =>
      request.query(`
        SELECT COUNT(*) AS Total
        FROM banc.conversation_participants me
        INNER JOIN banc.messages m ON m.ConversationId = me.ConversationId
        WHERE me.UserCode = @UserCode
          AND m.DeletedAt IS NULL
          AND m.SenderUserCode <> @UserCode
          AND (me.LastReadAt IS NULL OR m.CreatedAt > me.LastReadAt)
      `),
  };
};

// The other side's two watermarks come back with the user code, because every
// caller that wants one wants the other: sending needs the code to check
// permission and to deliver, reading needs the timestamps to render sent,
// delivered or seen. One seek answers both.
export const getOtherParticipant = (conversationId, userCode) => {
  const request = new sql.Request();
  request.input("ConversationId", sql.BigInt, asInt(conversationId));
  request.input("UserCode", sql.NVarChar, asText(userCode));
  return {
    request,
    run: () =>
      request.query(`
        SELECT TOP 1 UserCode, LastDeliveredAt, LastReadAt
        FROM banc.conversation_participants
        WHERE ConversationId = @ConversationId AND UserCode <> @UserCode
      `),
  };
};
