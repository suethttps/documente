Rails.application.routes.draw do
  root "home#index"

  # Autenticação
  get "login" => "sessions#new", as: :login
  resource :session, only: %i[new create destroy]
  resource :registration, only: %i[create]
  resources :passwords, param: :token
  resource :profile, only: %i[update]

  # Editor colaborativo
  get "app" => "editor#show", as: :app

  # Páginas (JSON) + export .md
  resources :pages, only: %i[index create update destroy] do
    member { get :export }
  end

  # Health check para load balancers / uptime monitors.
  get "up" => "rails/health#show", as: :rails_health_check
end
