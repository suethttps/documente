class User < ApplicationRecord
  COLORS = %w[#e2483d #22a06b #0c66e4 #8f7ee7 #e56910 #2898bd #ae4787 #6a9a23].freeze

  has_secure_password
  has_many :sessions, dependent: :destroy
  has_many :pages, foreign_key: :author_id, dependent: :nullify, inverse_of: :author

  normalizes :email_address, with: ->(e) { e.strip.downcase }
  normalizes :name, with: ->(n) { n.strip }

  validates :name, presence: true
  validates :email_address, presence: true, uniqueness: true
  validates :password, length: { minimum: 6 }, allow_nil: true

  before_validation -> { self.color ||= COLORS.sample }, on: :create

  def public_attributes
    { id: id, email: email_address, name: name, color: color }
  end
end
