module Users
  class SearchService < ApplicationService
    LIMIT = 20

    def initialize(current_user:, query:)
      @current_user = current_user
      @query = query.to_s.strip
    end

    def call
      return User.none if @query.blank?

      pattern = "%#{@query.gsub(/[%_]/) { |char| "\\#{char}" }}%"
      User.where.not(id: @current_user.id)
        .where("username ILIKE :q OR first_name ILIKE :q OR last_name ILIKE :q", q: pattern)
        .limit(LIMIT)
    end
  end
end
