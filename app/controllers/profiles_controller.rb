class ProfilesController < ApplicationController
  # Atualiza o nome do usuário logado (chamado pelo editor via fetch JSON).
  def update
    user = Current.user
    if user.update(params.permit(:name))
      render json: { user: user.public_attributes }
    else
      render json: { error: user.errors.full_messages.first }, status: :unprocessable_entity
    end
  end
end
