class ConversationSerializer < ApplicationService
  def initialize(conversation, current_user:, unread_count: 0)
    @conversation = conversation
    @current_user = current_user
    @unread_count = unread_count
  end

  def call
    other = @conversation.direct? ? @conversation.members.where.not(id: @current_user.id).first : nil
    { id: @conversation.id, kind: @conversation.kind, name: @conversation.name, members: members,
      other_user: other && UserSerializer.call(other), created_at: @conversation.created_at,
      unread_count: @unread_count, last_activity: Conversations::LastActivityService.call(@conversation, user: @current_user),
      read_receipts: read_receipts, presence: presence }
  end

  private

  # Everyone in the conversation, the viewer included, in the order they joined — the
  # group header counts them and the thread uses them for sender names/avatars (KAN-35).
  def members
    @conversation.conversation_memberships.includes(:user).order(:id).map { |membership| UserSerializer.call(membership.user) }
  end

  # The status each *other* member shows (online/idle/dnd/offline) and when they were
  # last seen (KAN-39) — the list dot, the header's "Active now"/"Active 5m ago", and the
  # starting point that NotificationsChannel's "presence" events then keep current.
  def presence
    others = @conversation.members.where.not(id: @current_user.id).to_a
    statuses = Presence.statuses(others.map(&:id))
    others.map { |user| { user_id: user.id, status: statuses[user.id], last_seen_at: user.last_seen_at } }
  end

  # How far each *other* member has read (KAN-36) — a list rather than one field so group
  # chats (KAN-35) can show several "seen by" avatars from the same data.
  def read_receipts
    @conversation.conversation_memberships.includes(:user).where.not(user_id: @current_user.id).map do |membership|
      { user: UserSerializer.call(membership.user), last_read_message_id: membership.last_read_message_id,
        last_read_at: membership.last_read_at }
    end
  end
end
